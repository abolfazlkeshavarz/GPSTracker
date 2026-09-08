// Command mqttsim simulates GPS tracker hardware.
//
// It publishes the exact payload shape produced by GPS-SIM800C-MQTT-DC.ino,
// so the whole ingest path (broker -> subscriber -> Postgres + Redis ->
// WebSocket) can be exercised without a physical device.
//
// The device must already exist in the database with a matching secret, or
// the subscriber will reject the message. `make db-seed` creates DEVICEADMIN
// with secret 357951, which is what this defaults to.
//
// Usage:
//
//	go run ./cmd/mqttsim -device DEVICEADMIN -secret 357951 -interval 3s
//	go run ./cmd/mqttsim -count 5 -interval 0    # publish 5 points and exit
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tracking-backend/internal/config"
	"tracking-backend/internal/integrity"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// payload mirrors the firmware's JSON exactly. Field names and types must not
// drift from publishGPS() in the .ino, or the backend will silently discard
// values.
type payload struct {
	Device     string  `json:"device"`
	Secret     string  `json:"secret"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	Speed      int     `json:"speed"`
	Satellites int     `json:"sat"`
	CSQ        int     `json:"csq"`
	Battery    float64 `json:"battery"`
	Ignition   bool    `json:"ignition"`
	Timestamp  int64   `json:"timestamp"`
	// Added in firmware rev 2; see firmware/GPS-SIM800C-MQTT-DC-v2.ino.
	Heading  float64 `json:"heading,omitempty"`
	Altitude float64 `json:"altitude,omitempty"`
	HDOP     float64 `json:"hdop,omitempty"`
	Operator string  `json:"operator,omitempty"`
	FixAgeMs int     `json:"fix_age_ms,omitempty"`

	// Signature replaces sending the secret in the clear (firmware rev 3+).
	Signature string `json:"sig,omitempty"`

	// Anti-theft telemetry and one-shot events (firmware rev 4+). Pointers so
	// an omitted field stays absent rather than serialising as false, which
	// the backend would read as "power really is off".
	ExtPower *bool   `json:"ext_power,omitempty"`
	Jamming  *bool   `json:"jamming,omitempty"`
	Event    string  `json:"event,omitempty"`
	AccelG   float64 `json:"accel_g,omitempty"`
}

func boolPtr(v bool) *bool { return &v }

func main() {
	cfg := config.Load()

	var (
		broker   = flag.String("broker", cfg.MQTTBroker, "MQTT broker URL")
		user     = flag.String("user", cfg.MQTTUser, "MQTT username")
		pass     = flag.String("password", cfg.MQTTPassword, "MQTT password")
		device   = flag.String("device", "DEVICEADMIN", "Device serial")
		secret   = flag.String("secret", "357951", "Device secret (must match the database)")
		lat      = flag.Float64("lat", 35.6892, "Starting latitude")
		lng      = flag.Float64("lng", 51.3890, "Starting longitude")
		interval = flag.Duration("interval", 3*time.Second, "Delay between publishes (0 = as fast as possible)")
		count    = flag.Int("count", 0, "Number of messages to publish (0 = run until interrupted)")
		badParam = flag.Bool("bad-secret", false, "Deliberately send a wrong secret, to verify rejection")

		// Gap-free tracking and tamper-evidence exercises.
		legacyAuth = flag.Bool("legacy-auth", false, "Send the plaintext secret instead of an HMAC signature")
		backfill   = flag.Duration("backfill", 0, "Backdate points by this much, simulating replay after a coverage gap")
		gapAfter   = flag.Int("gap-after", 0, "Publish N live points, then replay a buffered gap (implies -count)")
		gapMinutes = flag.Int("gap-minutes", 30, "Length of the simulated coverage gap, in minutes")
		replayLast = flag.Bool("replay", false, "Re-send the previous run's points, to verify duplicates are ignored")

		// Odometer exercise: walk a straight line in fixed steps so the
		// expected lifetime distance is known ahead of time.
		distanceSteps = flag.Int("distance-steps", 0, "Publish N points due east in fixed steps, then exit (for the odometer)")
		stepMeters    = flag.Float64("step-meters", 100.0, "Ground distance between points when -distance-steps is set")

		// Alert-engine exercises.
		theft = flag.Bool("theft", false, "Run a theft scenario: tow, power cut, then jamming")

		// Control channel. Without this the server can send commands but
		// nothing ever answers, so every one ends up 'expired'.
		obeyCommands = flag.Bool("obey", false, "Subscribe to the command topic and acknowledge commands")
		// Bounded lifetime for scripted use. `go run` execs a child, so a
		// script that kills the `go run` process leaves the simulator running
		// as an orphan; letting it time itself out avoids that entirely.
		runFor = flag.Duration("run-for", 0, "Exit after this long (0 = run until interrupted)")
	)
	flag.Parse()

	if *badParam {
		*secret = "wrong-secret-" + fmt.Sprint(rand.Intn(1000))
		log.Println("Sending a deliberately INVALID secret; the backend should reject these")
	}

	topic := fmt.Sprintf("devices/%s/location", *device)

	opts := mqtt.NewClientOptions()
	opts.AddBroker(*broker)
	opts.SetUsername(*user)
	opts.SetPassword(*pass)
	opts.SetClientID(fmt.Sprintf("mqttsim_%s_%d", *device, time.Now().UnixNano()))
	opts.SetCleanSession(true)
	opts.SetConnectTimeout(10 * time.Second)

	client := mqtt.NewClient(opts)

	log.Printf("Connecting to %s ...", *broker)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("connect failed: %v", token.Error())
	}
	defer client.Disconnect(250)

	log.Printf("Connected. Publishing to %s every %s", topic, *interval)

	if *obeyCommands {
		subscribeToCommands(client, *device, *secret)
	}

	// Ctrl-C should stop cleanly rather than leaving the broker session open.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	// A deadline closes the same channel, so every wait below handles it
	// without needing a second case.
	if *runFor > 0 {
		log.Printf("Will exit after %s", *runFor)
		time.AfterFunc(*runFor, func() {
			select {
			case stop <- syscall.SIGTERM:
			default:
			}
		})
	}

	sent := 0
	curLat, curLng := *lat, *lng

	// A simulated coverage gap: publish some live points, then replay the
	// buffered ones with their original (older) timestamps. This is what real
	// store-and-forward firmware does coming out of a tunnel.
	if *gapAfter > 0 {
		runGapScenario(client, topic, *device, *secret, *legacyAuth,
			*gapAfter, *gapMinutes, curLat, curLng)
		return
	}

	if *distanceSteps > 0 {
		runDistanceScenario(client, topic, *device, *secret, *legacyAuth,
			*distanceSteps, *stepMeters, curLat, curLng)
		return
	}

	if *theft {
		runTheftScenario(client, topic, *device, *secret, *legacyAuth, curLat, curLng)
		return
	}

	for {
		select {
		case <-stop:
			log.Printf("Interrupted after %d message(s)", sent)
			return
		default:
		}

		// Walk roughly north-east with a little jitter so the track looks
		// like movement rather than a straight line.
		heading := 0.7 + rand.Float64()*0.2
		step := 0.0004 + rand.Float64()*0.0003
		curLat += step * math.Cos(heading)
		curLng += step * math.Sin(heading)

		ts := time.Now().Unix()
		if *backfill > 0 {
			ts = time.Now().Add(-*backfill).Unix()
		}
		if *replayLast {
			// Deterministic timestamps so a second run collides with the first
			// and exercises the ON CONFLICT DO NOTHING path.
			//
			// Anchored to the current hour rather than a fixed epoch: a hard
			// constant eventually falls outside the server's 30-day backfill
			// window, where it is clamped to "now" and every run gets a fresh
			// timestamp — which silently stops testing deduplication at all.
			anchor := time.Now().UTC().Truncate(time.Hour).Add(-time.Hour)
			ts = anchor.Unix() + int64(sent)*30
		}

		msg := payload{
			Device:     *device,
			Secret:     *secret,
			Lat:        round6(curLat),
			Lng:        round6(curLng),
			Speed:      30 + rand.Intn(60),
			Satellites: 5 + rand.Intn(7),
			CSQ:        12 + rand.Intn(18),
			Battery:    round2(11.9 + rand.Float64()*1.0),
			Ignition:   true,
			Timestamp:  ts,
			// Degrees, derived from the direction actually walked.
			Heading:  round2(math.Mod(heading*180/math.Pi+360, 360)),
			Altitude: round2(1150 + rand.Float64()*40),
			HDOP:     round2(0.8 + rand.Float64()*1.8),
			Operator: "MCI",
			FixAgeMs: 200 + rand.Intn(900),
		}

		signMessage(&msg, *secret, *legacyAuth)

		body, err := json.Marshal(msg)
		if err != nil {
			log.Fatalf("marshal: %v", err)
		}

		// QoS 1: the firmware uses QoS 0, but for a test tool an at-least-once
		// delivery makes results reproducible.
		token := client.Publish(topic, 1, false, body)
		if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
			log.Printf("publish failed: %v", token.Error())
		} else {
			sent++
			log.Printf("[%d] %s lat=%.6f lng=%.6f speed=%d sat=%d csq=%d batt=%.2f",
				sent, *device, msg.Lat, msg.Lng, msg.Speed, msg.Satellites, msg.CSQ, msg.Battery)
		}

		if *count > 0 && sent >= *count {
			log.Printf("Published %d message(s), exiting", sent)
			return
		}

		if *interval > 0 {
			select {
			case <-stop:
				log.Printf("Interrupted after %d message(s)", sent)
				return
			case <-time.After(*interval):
			}
		}
	}
}

func round6(v float64) float64 { return math.Round(v*1e6) / 1e6 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }

// signMessage attaches an HMAC signature, or leaves the plaintext secret in
// place when emulating legacy firmware.
func signMessage(msg *payload, secret string, legacy bool) {
	if legacy {
		msg.Signature = ""
		return
	}

	msg.Signature = integrity.SignPayload(secret, msg.Device, msg.Timestamp, msg.Lat, msg.Lng)

	// The whole point of signing is that the secret stops travelling in the
	// clear, so drop it once a signature is present.
	msg.Secret = ""
}

// runDistanceScenario publishes points marching due east in fixed ground
// steps, so the odometer's expected gain is simply (steps-1) * stepMeters —
// the first point only seeds the anchor.
//
// Timestamps are spaced 5 s apart and end at "now": distinct per second so
// none collide on the (device, recorded_at) unique index, and all inside the
// 3-minute backfill threshold so every point feeds the live odometer. Keep
// -distance-steps at 30 or below to stay within that window.
func runDistanceScenario(
	client mqtt.Client, topic, device, secret string, legacy bool,
	steps int, stepMeters float64, lat, lng float64,
) {
	// Metres per degree of longitude shrink with latitude; convert once.
	metersPerDegLng := 111320.0 * math.Cos(lat*math.Pi/180)
	dLng := stepMeters / metersPerDegLng

	now := time.Now()

	log.Printf("--- %d points, %.0f m apart due east ---", steps, stepMeters)
	log.Printf("expected odometer gain: %.0f m (%.2f km)",
		float64(steps-1)*stepMeters, float64(steps-1)*stepMeters/1000)

	for i := 0; i < steps; i++ {
		ts := now.Add(-time.Duration(steps-1-i) * 5 * time.Second).Unix()

		msg := payload{
			Device:     device,
			Secret:     secret,
			Lat:        round6(lat),
			Lng:        round6(lng),
			Speed:      50,
			Satellites: 10,
			CSQ:        20,
			Battery:    round2(12.4),
			Ignition:   true,
			Timestamp:  ts,
			Heading:    90,
			Operator:   "MCI",
		}
		signMessage(&msg, secret, legacy)

		body, _ := json.Marshal(msg)
		token := client.Publish(topic, 1, false, body)
		token.WaitTimeout(10 * time.Second)
		log.Printf("[%d/%d] %s  %.6f,%.6f", i+1, steps, device, msg.Lat, msg.Lng)

		lng += dLng
		time.Sleep(80 * time.Millisecond) // pace the broker, not the timestamps
	}

	log.Println("Distance scenario complete.")
}

// subscribeToCommands turns the simulator into a virtual device on the
// control channel: it receives commands, verifies them the way the firmware
// does, and acknowledges them.
//
// Signature verification is not decoration here. It is the half of the
// contract that stops anyone with broker access stopping any vehicle on it,
// and having the simulator enforce it means a change that breaks the signing
// format shows up in `make smoke` rather than on a customer's car.
func subscribeToCommands(client mqtt.Client, device, secret string) {
	cmdTopic := fmt.Sprintf("devices/%s/commands", device)
	ackTopic := fmt.Sprintf("devices/%s/ack", device)

	token := client.Subscribe(cmdTopic, 1, func(_ mqtt.Client, m mqtt.Message) {
		var cmd struct {
			ID        int64           `json:"id"`
			Device    string          `json:"device"`
			Command   string          `json:"command"`
			Params    json.RawMessage `json:"params"`
			Timestamp int64           `json:"ts"`
			Signature string          `json:"sig"`
		}

		if err := json.Unmarshal(m.Payload(), &cmd); err != nil {
			log.Printf("command parse error: %v", err)
			return
		}

		// Must match SignMessage in internal/integrity/chain.go:
		//     device|id|command|ts
		valid := integrity.VerifyMessage(secret, cmd.Signature,
			cmd.Device, fmt.Sprint(cmd.ID), cmd.Command, fmt.Sprint(cmd.Timestamp))

		if !valid {
			log.Printf("command %d (%s): SIGNATURE INVALID - ignored", cmd.ID, cmd.Command)
			return
		}

		log.Printf("command %d: %s (signature ok)", cmd.ID, cmd.Command)

		status, result := "ok", "Simulated"

		// Mirror the firmware's own interlock so the refusal path is exercised
		// too, not just the happy one.
		if cmd.Command == "engine_cut" {
			result = "Engine cut (simulated)"
		}

		ts := time.Now().Unix()
		ack := map[string]any{
			"device": device,
			"id":     cmd.ID,
			"status": status,
			"result": result,
			"ts":     ts,
			"sig": integrity.SignMessage(secret,
				device, fmt.Sprint(cmd.ID), status, fmt.Sprint(ts)),
		}

		body, _ := json.Marshal(ack)
		client.Publish(ackTopic, 1, false, body).WaitTimeout(5 * time.Second)

		log.Printf("acked %d as %s", cmd.ID, status)
	})

	if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
		log.Printf("command subscribe failed: %v", token.Error())
		return
	}

	log.Printf("Listening for commands on %s", cmdTopic)
}

// runTheftScenario walks the alert engine through a realistic theft.
//
// The sequence matters. Each step establishes the baseline the next one
// transitions away from, because every one of these rules fires on a change
// rather than on a state — publishing "power is off" out of nowhere alerts
// nothing, which is exactly the bug this scenario is here to catch.
func runTheftScenario(
	client mqtt.Client, topic, device, secret string, legacy bool, lat, lng float64,
) {
	now := time.Now()
	step := 0

	// Timestamps 10s apart, ending at now: distinct per second so none collide
	// on the unique index, and all inside the 3-minute backfill threshold so
	// every point counts as live and is evaluated.
	send := func(label string, mutate func(*payload)) {
		step++
		msg := payload{
			Device: device, Secret: secret,
			Lat: round6(lat), Lng: round6(lng),
			Speed: 0, Satellites: 10, CSQ: 22,
			Battery: round2(12.4), Ignition: false,
			Timestamp: now.Add(-time.Duration(20-step) * 10 * time.Second).Unix(),
			Operator:  "MCI",
			ExtPower:  boolPtr(true),
			Jamming:   boolPtr(false),
		}
		mutate(&msg)
		signMessage(&msg, secret, legacy)

		body, _ := json.Marshal(msg)
		token := client.Publish(topic, 1, false, body)
		token.WaitTimeout(10 * time.Second)

		log.Printf("[%2d] %-28s speed=%3d ign=%-5v power=%-5v jam=%-5v event=%s",
			step, label, msg.Speed, msg.Ignition, *msg.ExtPower, *msg.Jamming, msg.Event)

		time.Sleep(600 * time.Millisecond)
	}

	log.Println("--- baseline: parked, ignition off, on vehicle power ---")
	send("parked", func(p *payload) {})
	send("parked", func(p *payload) {})

	log.Println("--- the vehicle starts moving with the ignition off ---")
	// Expect: tow (critical).
	for i := 0; i < 2; i++ {
		lat += 0.0004
		lng += 0.0004
		send("moving, ignition off", func(p *payload) {
			p.Lat, p.Lng = round6(lat), round6(lng)
			p.Speed = 25
		})
	}

	log.Println("--- the main power lead is cut ---")
	// Expect: power_cut (critical). The transition from the true baseline
	// above is what fires it.
	send("power cut", func(p *payload) {
		p.Speed = 25
		p.ExtPower = boolPtr(false)
	})

	log.Println("--- a jammer is switched on ---")
	// Expect: jamming (critical).
	send("jammer detected", func(p *payload) {
		p.Speed = 30
		p.ExtPower = boolPtr(false)
		p.Jamming = boolPtr(true)
	})

	log.Println("--- the thief starts the engine ---")
	// Expect: ignition_on (info).
	send("ignition on", func(p *payload) {
		p.Speed = 40
		p.Ignition = true
		p.ExtPower = boolPtr(false)
	})

	log.Println("--- and drives into something ---")
	// Expect: impact (critical).
	send("impact", func(p *payload) {
		p.Speed = 55
		p.Ignition = true
		p.ExtPower = boolPtr(false)
		p.Event = "impact"
		p.AccelG = 6.4
	})

	log.Println("Theft scenario complete. Check /alerts — expect tow, power cut,")
	log.Println("jamming, ignition on and impact.")
}

// runGapScenario emulates store-and-forward firmware: live points, a coverage
// gap during which points are buffered, then a burst of backdated replays.
func runGapScenario(
	client mqtt.Client, topic, device, secret string, legacy bool,
	liveCount, gapMinutes int, lat, lng float64,
) {
	publish := func(msg payload) {
		signMessage(&msg, secret, legacy)

		body, _ := json.Marshal(msg)
		token := client.Publish(topic, 1, false, body)
		token.WaitTimeout(10 * time.Second)

		kind := "live"
		if msg.Timestamp < time.Now().Add(-3*time.Minute).Unix() {
			kind = "BACKFILL"
		}
		log.Printf("[%8s] %s  t=%s  %.6f,%.6f",
			kind, device, time.Unix(msg.Timestamp, 0).Format("15:04:05"), msg.Lat, msg.Lng)
	}

	base := func(ts int64, la, ln float64) payload {
		return payload{
			Device: device, Secret: secret,
			Lat: round6(la), Lng: round6(ln),
			Speed: 40 + rand.Intn(30), Satellites: 8 + rand.Intn(4),
			CSQ: 15 + rand.Intn(12), Battery: round2(12.0 + rand.Float64()*0.6),
			Ignition: true, Timestamp: ts,
			Heading: round2(rand.Float64() * 360), Operator: "MCI",
		}
	}

	now := time.Now()

	log.Printf("--- %d live points before the gap ---", liveCount)
	for i := 0; i < liveCount; i++ {
		lat += 0.0006
		lng += 0.0008
		publish(base(now.Add(time.Duration(i-liveCount)*30*time.Second).Unix(), lat, lng))
		time.Sleep(250 * time.Millisecond)
	}

	log.Printf("--- simulating a %d-minute coverage gap ---", gapMinutes)

	// Points the device recorded while offline, one per 30s, replayed oldest
	// first exactly as a drain-the-buffer implementation would.
	buffered := (gapMinutes * 60) / 30
	log.Printf("--- replaying %d buffered points ---", buffered)

	for i := 0; i < buffered; i++ {
		lat += 0.0006
		lng += 0.0008

		// Count down in 30s steps from the start of the gap. Using minutes
		// here produced duplicate timestamps, which the server then correctly
		// rejected as replays - hiding half the points.
		age := time.Duration(gapMinutes)*time.Minute - time.Duration(i)*30*time.Second
		publish(base(now.Add(-age).Unix(), lat, lng))
		time.Sleep(60 * time.Millisecond)
	}

	log.Printf("--- back online, one current point ---")
	lat += 0.0006
	lng += 0.0008
	publish(base(now.Unix(), lat, lng))

	log.Println("Gap scenario complete.")
}
