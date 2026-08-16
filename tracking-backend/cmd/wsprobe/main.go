// Command wsprobe opens a WebSocket to the API and reports exactly how it
// behaves over time: when it opens, every frame received, and — critically —
// the close code and reason when it ends.
//
// It exists because "the connection breaks after a few seconds" is impossible
// to diagnose from the browser alone: the browser reports code 1006 for every
// abnormal close, hiding whether the server closed it, a proxy timed it out,
// or the handshake failed.
//
// Usage:
//
//	go run ./cmd/wsprobe -phone admin -password password123 -duration 90s
//	go run ./cmd/wsprobe -api http://127.0.0.1:5173 -duration 90s   # via Vite
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	var (
		apiURL   = flag.String("api", "http://127.0.0.1:8080", "API base URL (use :5173 to test through the Vite proxy)")
		phone    = flag.String("phone", "admin", "Login phone")
		password = flag.String("password", "password123", "Login password")
		duration = flag.Duration("duration", 90*time.Second, "How long to hold the connection open")
	)
	flag.Parse()

	token, err := login(*apiURL, *phone, *password)
	if err != nil {
		log.Fatalf("login failed: %v", err)
	}
	log.Printf("logged in as %s", *phone)

	wsURL := strings.Replace(*apiURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL += "/api/ws?token=" + url.QueryEscape(token)

	// Origin must be in the server's allowlist or the upgrade is refused.
	header := http.Header{}
	header.Set("Origin", "http://localhost:5173")

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}

	start := time.Now()
	conn, resp, err := dialer.Dial(wsURL, header)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(resp.Body)
			log.Fatalf("dial failed after %s: %v (HTTP %d: %s)",
				time.Since(start), err, resp.StatusCode, strings.TrimSpace(string(body)))
		}
		log.Fatalf("dial failed after %s: %v", time.Since(start), err)
	}
	defer conn.Close()

	log.Printf("CONNECTED in %s", time.Since(start))

	// Report ping/pong so we can see whether the keepalive is working.
	conn.SetPingHandler(func(data string) error {
		log.Printf("[%6.1fs] <- PING from server (replying pong)", time.Since(start).Seconds())
		return conn.WriteControl(websocket.PongMessage, []byte(data), time.Now().Add(5*time.Second))
	})
	conn.SetPongHandler(func(string) error {
		log.Printf("[%6.1fs] <- PONG from server", time.Since(start).Seconds())
		return nil
	})

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			// No read deadline: we want to observe how long the peer keeps it
			// open, not impose our own timeout.
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				elapsed := time.Since(start).Seconds()

				if ce, ok := err.(*websocket.CloseError); ok {
					log.Printf("[%6.1fs] CLOSED code=%d reason=%q", elapsed, ce.Code, ce.Text)
				} else {
					log.Printf("[%6.1fs] READ ERROR (no close frame): %v", elapsed, err)
				}
				return
			}

			preview := string(data)
			if len(preview) > 120 {
				preview = preview[:120] + "..."
			}
			log.Printf("[%6.1fs] <- type=%d %s", time.Since(start).Seconds(), msgType, preview)
		}
	}()

	select {
	case <-done:
		log.Printf("connection ended after %s", time.Since(start))
		os.Exit(1)
	case <-stop:
		log.Printf("interrupted after %s", time.Since(start))
	case <-time.After(*duration):
		log.Printf("SUCCESS: stayed open for the full %s", *duration)
		_ = conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(2*time.Second))
	}
}

func login(apiURL, phone, password string) (string, error) {
	body, _ := json.Marshal(map[string]string{"phone": phone, "password": password})

	resp, err := http.Post(apiURL+"/api/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Token == "" {
		return "", fmt.Errorf("no token in response")
	}

	return out.Token, nil
}
