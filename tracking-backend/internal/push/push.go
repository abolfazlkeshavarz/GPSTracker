// Package push delivers Web Push notifications to a user's registered
// browsers and installed PWAs.
//
// This is the only channel that reaches someone who does not have the app
// open. The WebSocket feed covers a live tab; a stolen vehicle at 3am does
// not. Everything here is therefore best-effort and never blocks the caller:
// a push endpoint that is slow or down must not hold up storing an alert.
package push

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Config holds the VAPID identity this server pushes as. Without a key pair
// the package stays disabled and every send is a no-op, so the rest of the
// application runs unchanged in environments that never configured it.
type Config struct {
	PublicKey  string
	PrivateKey string
	// Subject is the mailto: or https: URL a push service can use to contact
	// the operator about this application. Required by the VAPID spec.
	Subject string
}

var (
	mu  sync.RWMutex
	cfg Config
)

// Configure installs the VAPID key pair. Safe to call with empty values,
// which leaves push disabled.
func Configure(c Config) {
	mu.Lock()
	defer mu.Unlock()

	if c.Subject == "" {
		c.Subject = "mailto:support@localhost"
	}
	cfg = c
}

// Enabled reports whether a usable key pair is configured.
func Enabled() bool {
	mu.RLock()
	defer mu.RUnlock()
	return cfg.PublicKey != "" && cfg.PrivateKey != ""
}

// PublicKey returns the application server key the browser needs to subscribe.
func PublicKey() string {
	mu.RLock()
	defer mu.RUnlock()
	return cfg.PublicKey
}

func current() Config {
	mu.RLock()
	defer mu.RUnlock()
	return cfg
}

// Payload is what the service worker receives and renders as a notification.
//
// Deliberately small: push services cap the encrypted payload (4 KB is the
// commonly quoted safe ceiling) and this travels through a third party, so it
// carries only what the notification shows plus the id needed to fetch the
// rest once the app opens.
type Payload struct {
	Type         string `json:"type"`
	AlertID      int64  `json:"alert_id,omitempty"`
	DeviceSerial string `json:"device_serial,omitempty"`
	Kind         string `json:"kind,omitempty"`
	Severity     string `json:"severity,omitempty"`
	Title        string `json:"title"`
	Body         string `json:"body,omitempty"`
	// URL the notification opens. Relative to the app origin.
	URL string `json:"url,omitempty"`
	// Silent suppresses sound and vibration but still shows the notification —
	// the "silent alarm" case, where a noise would tell a thief they are being
	// watched.
	Silent bool `json:"silent,omitempty"`
}

// SendToUser delivers a payload to every endpoint the user has registered.
//
// Runs synchronously; callers on a latency-sensitive path (the MQTT ingest
// loop) should invoke it in a goroutine. Errors are logged, never returned:
// there is nothing a caller could usefully do about a dead browser endpoint.
func SendToUser(pg *sql.DB, userID int64, p Payload) {
	if !Enabled() {
		return
	}

	body, err := json.Marshal(p)
	if err != nil {
		log.Println("push: marshal payload:", err)
		return
	}

	rows, err := pg.Query(
		"SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", userID)
	if err != nil {
		log.Println("push: load subscriptions:", err)
		return
	}

	type target struct {
		id       int64
		endpoint string
		p256dh   string
		auth     string
	}

	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.id, &t.endpoint, &t.p256dh, &t.auth); err != nil {
			continue
		}
		targets = append(targets, t)
	}
	rows.Close()

	if len(targets) == 0 {
		return
	}

	c := current()

	// A critical alert must survive a phone that is asleep; an informational
	// one should not wake the radio. Urgency is the documented lever for that.
	urgency := webpush.UrgencyNormal
	if p.Severity == "critical" {
		urgency = webpush.UrgencyHigh
	} else if p.Severity == "info" {
		urgency = webpush.UrgencyLow
	}

	for _, t := range targets {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)

		resp, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
			Endpoint: t.endpoint,
			Keys:     webpush.Keys{P256dh: t.p256dh, Auth: t.auth},
		}, &webpush.Options{
			Subscriber:      c.Subject,
			VAPIDPublicKey:  c.PublicKey,
			VAPIDPrivateKey: c.PrivateKey,
			TTL:             int((6 * time.Hour).Seconds()),
			Urgency:         urgency,
			// Collapse repeats of the same rule for the same device, so a unit
			// flapping in and out of a geofence leaves one notification rather
			// than forty.
			Topic: topicFor(p),
		})
		cancel()

		if err != nil {
			log.Printf("push: send to subscription %d: %v", t.id, err)
			continue
		}

		// 404/410 mean the browser threw the subscription away (permission
		// revoked, app uninstalled, profile cleared). Keeping the row would
		// retry a dead endpoint on every alert forever.
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			if _, err := pg.Exec("DELETE FROM push_subscriptions WHERE id = $1", t.id); err != nil {
				log.Println("push: prune dead subscription:", err)
			}
			log.Printf("push: pruned dead subscription %d (HTTP %d)", t.id, resp.StatusCode)
		} else if resp.StatusCode >= 300 {
			log.Printf("push: subscription %d rejected with HTTP %d", t.id, resp.StatusCode)
		} else {
			if _, err := pg.Exec(
				"UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1", t.id,
			); err != nil {
				log.Println("push: touch subscription:", err)
			}
		}

		resp.Body.Close()
	}
}

// topicFor builds the collapse key. Push services replace an undelivered
// message with a later one carrying the same topic.
//
// Only rules that can repeat get a topic; one-shot safety events (impact, SOS,
// a cut battery) are left uncollapsed so a second one is never swallowed.
func topicFor(p Payload) string {
	switch p.Kind {
	case "impact", "sos", "power_cut", "tow":
		return ""
	default:
		if p.DeviceSerial == "" || p.Kind == "" {
			return ""
		}
		// Push topics must be URL-safe base64 and short; device serial plus
		// kind is well inside that for realistic serials.
		return p.Kind + "-" + p.DeviceSerial
	}
}

// GenerateVAPIDKeys returns a fresh (private, public) VAPID key pair.
func GenerateVAPIDKeys() (privateKey, publicKey string, err error) {
	return webpush.GenerateVAPIDKeys()
}
