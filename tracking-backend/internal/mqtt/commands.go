package mqtt

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"tracking-backend/internal/integrity"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

/*
The control channel: commands out, acknowledgements back.

Everything the platform can make a unit do — cut the engine, lock the doors,
report right now, change its reporting interval — travels this path.

Two decisions shape it:

  1. Commands are QUEUED IN POSTGRES, not fired at the broker and forgotten.
     A device on GPRS is routinely unreachable for a minute at a time, and the
     one question this feature has to answer honestly is "did the engine
     actually cut?". A row with pending / sent / acked states can answer that;
     a publish call cannot.

  2. Commands are SIGNED with the device secret, exactly like the telemetry
     coming the other way. Without that, anybody who could write to the broker
     could stop any vehicle on it — which would make this the most dangerous
     feature in the product rather than its most valuable one.
*/

const (
	// commandTTL is how long a queued command stays worth delivering. A
	// "cut the engine" issued during a theft is meaningless six hours later,
	// and silently executing a stale command when a unit finally reconnects
	// would be worse than dropping it.
	commandTTL = 30 * time.Minute

	// ackTopicFilter is the uplink the device confirms on.
	ackTopicFilter = "devices/+/ack"
)

// CommandMessage is the downlink payload.
type CommandMessage struct {
	ID        int64           `json:"id"`
	Device    string          `json:"device"`
	Command   string          `json:"command"`
	Params    json.RawMessage `json:"params,omitempty"`
	Timestamp int64           `json:"ts"`
	Signature string          `json:"sig"`
}

// ackMessage is what the device publishes back once it has acted.
type ackMessage struct {
	Device    string `json:"device"`
	ID        int64  `json:"id"`
	Status    string `json:"status"` // "ok" or "error"
	Result    string `json:"result,omitempty"`
	Timestamp int64  `json:"ts"`
	Signature string `json:"sig"`
}

// CommandTopic is where a unit listens for instructions.
func CommandTopic(serial string) string {
	return "devices/" + serial + "/commands"
}

// ErrBrokerUnavailable reports that the command was stored but could not be
// handed to the broker. The caller should surface this rather than claim the
// vehicle received anything.
var ErrBrokerUnavailable = errors.New("MQTT broker is not connected")

// PublishCommand signs and sends a queued command, then marks it sent.
//
// A command that cannot be published stays 'pending' and is retried by the
// sweeper, so a device that is briefly offline still gets it.
func PublishCommand(pg *sql.DB, id int64, serial, secret, command string, params json.RawMessage) error {
	ts := time.Now().Unix()

	msg := CommandMessage{
		ID:        id,
		Device:    serial,
		Command:   command,
		Params:    params,
		Timestamp: ts,
		Signature: integrity.SignMessage(secret,
			serial, fmt.Sprint(id), command, fmt.Sprint(ts)),
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	if mqttClient == nil || !mqttClient.IsConnected() {
		return ErrBrokerUnavailable
	}

	// QoS 1: a control command must not be silently dropped by the broker.
	// Retained is deliberately false — a retained engine-cut would be
	// re-delivered to the device on every future reconnect.
	token := mqttClient.Publish(CommandTopic(serial), 1, false, body)
	if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
		return fmt.Errorf("publishing command: %w", token.Error())
	}

	if _, err := pg.Exec(
		"UPDATE device_commands SET status = 'sent', sent_at = NOW() WHERE id = $1 AND status = 'pending'",
		id,
	); err != nil {
		log.Println("command sent-state update error:", err)
	}

	log.Printf("Command [%s] %s -> %s (id %d)", "sent", command, serial, id)
	return nil
}

// handleAck processes a device's confirmation that it acted on a command.
func handleAck(pg *sql.DB, topic string, payload []byte) {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 {
		log.Println("invalid ack topic:", topic)
		return
	}
	topicDevice := parts[1]

	var ack ackMessage
	if err := json.Unmarshal(payload, &ack); err != nil {
		log.Println("ack parse error:", err)
		return
	}

	// A device may only acknowledge its own commands, and the topic is the
	// authority on which device that is.
	if ack.Device != topicDevice {
		log.Printf("ack device mismatch: topic=%s payload=%s", topicDevice, ack.Device)
		return
	}

	var secret string
	if err := pg.QueryRow(
		"SELECT device_secret FROM devices WHERE serial = $1", topicDevice,
	).Scan(&secret); err != nil {
		log.Printf("ack from unknown device: %s", topicDevice)
		return
	}

	if !integrity.VerifyMessage(secret, ack.Signature,
		ack.Device, fmt.Sprint(ack.ID), ack.Status, fmt.Sprint(ack.Timestamp)) {
		log.Printf("ack signature invalid for %s command %d", topicDevice, ack.ID)
		return
	}

	status := "acked"
	if ack.Status != "ok" {
		status = "failed"
	}

	// Scoped to the device as well as the id, so a compromised unit cannot
	// close out another device's command.
	res, err := pg.Exec(`
        UPDATE device_commands
        SET status = $3, acked_at = NOW(), result = NULLIF($4, '')
        WHERE id = $1 AND device_serial = $2 AND status IN ('pending', 'sent')`,
		ack.ID, topicDevice, status, ack.Result)
	if err != nil {
		log.Println("ack update error:", err)
		return
	}

	if n, _ := res.RowsAffected(); n == 0 {
		log.Printf("ack for unknown or already-closed command %d on %s", ack.ID, topicDevice)
		return
	}

	log.Printf("Command %d on %s -> %s", ack.ID, topicDevice, status)
}

// DrainPendingCommands retries commands that could not be published when they
// were issued, and expires the ones that have gone stale.
//
// Runs on a ticker rather than reacting to a device coming online: there is no
// reliable "device connected" signal on this broker setup, since a unit that
// loses GPRS mid-session never sends a disconnect.
func DrainPendingCommands(pg *sql.DB) {
	if _, err := pg.Exec(`
        UPDATE device_commands
        SET status = 'expired',
            result = 'Not delivered before the command expired'
        WHERE status IN ('pending', 'sent')
          AND issued_at < NOW() - $1::interval`,
		fmt.Sprintf("%d seconds", int(commandTTL.Seconds())),
	); err != nil {
		log.Println("command expiry sweep error:", err)
	}

	if mqttClient == nil || !mqttClient.IsConnected() {
		return
	}

	rows, err := pg.Query(`
        SELECT c.id, c.device_serial, c.command, c.params, d.device_secret
        FROM device_commands c
        JOIN devices d ON d.serial = c.device_serial
        WHERE c.status = 'pending'
        ORDER BY c.issued_at
        LIMIT 100`)
	if err != nil {
		log.Println("pending command query error:", err)
		return
	}

	type pending struct {
		id      int64
		serial  string
		command string
		params  []byte
		secret  string
	}

	var queue []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.serial, &p.command, &p.params, &p.secret); err != nil {
			continue
		}
		queue = append(queue, p)
	}
	rows.Close()

	for _, p := range queue {
		if err := PublishCommand(pg, p.id, p.serial, p.secret, p.command, p.params); err != nil {
			log.Printf("retrying command %d later: %v", p.id, err)
		}
	}
}

/* ------------------------------------------------------------- sweeper */

var commandSweepStop chan struct{}

// StartCommandSweeper retries undelivered commands and expires stale ones.
func StartCommandSweeper(pg *sql.DB, interval time.Duration) {
	commandSweepStop = make(chan struct{})
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			DrainPendingCommands(pg)
		case <-commandSweepStop:
			return
		}
	}
}

// StopCommandSweeper stops the goroutine started by StartCommandSweeper.
func StopCommandSweeper() {
	if commandSweepStop != nil {
		close(commandSweepStop)
	}
}

// subscribeAcks wires the ack topic. Called from the subscriber's on-connect
// handler so it is re-established after a broker restart, exactly like the
// location subscription.
func subscribeAcks(c mqtt.Client, pg *sql.DB) {
	if token := c.Subscribe(ackTopicFilter, 1, func(_ mqtt.Client, m mqtt.Message) {
		handleAck(pg, m.Topic(), m.Payload())
	}); token.Wait() && token.Error() != nil {
		log.Println("MQTT ack subscribe error:", token.Error())
		return
	}

	log.Println("Subscribed to topic:", ackTopicFilter)
}
