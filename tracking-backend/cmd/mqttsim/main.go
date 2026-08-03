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
}

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

	// Ctrl-C should stop cleanly rather than leaving the broker session open.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	sent := 0
	curLat, curLng := *lat, *lng

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
			Timestamp:  time.Now().Unix(),
			// Degrees, derived from the direction actually walked.
			Heading:  round2(math.Mod(heading*180/math.Pi+360, 360)),
			Altitude: round2(1150 + rand.Float64()*40),
			HDOP:     round2(0.8 + rand.Float64()*1.8),
			Operator: "MCI",
			FixAgeMs: 200 + rand.Intn(900),
		}

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
