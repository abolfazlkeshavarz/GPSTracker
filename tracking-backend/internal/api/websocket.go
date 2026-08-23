package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"tracking-backend/internal/db"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	// writeWait is how long a single write may block before the peer is
	// considered gone.
	writeWait = 10 * time.Second

	// pongWait is how long we tolerate silence from the client. It must be
	// comfortably larger than pingPeriod.
	pongWait = 60 * time.Second

	// pingPeriod is how often we ping. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// maxMessageSize caps inbound frames; clients are not expected to send
	// anything but control frames.
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,

	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")

		// Browsers always send Origin on a WebSocket handshake; an empty one
		// means a native/mobile client or a tool like Postman, which cannot be
		// tricked into making a cross-site request on a user's behalf.
		if origin == "" {
			return true
		}

		// Shares the allowlist with the CORS middleware so the two cannot drift.
		return IsOriginAllowed(origin)
	},
}

// readPump drains the connection and closes done when the peer goes away.
//
// Nothing was reading from these sockets before, so close frames and pong
// replies were never processed: a disconnected client stayed "connected"
// server-side until the next write happened to fail, holding a goroutine and a
// Redis subscription open indefinitely. For a device that stops reporting,
// that is forever.
func readPump(conn *websocket.Conn, done chan<- struct{}) {
	defer close(done)

	conn.SetReadLimit(maxMessageSize)
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// closeGracefully sends a real close frame before hanging up.
//
// Without it the server just drops the TCP connection and every client sees
// code 1006 ("abnormal closure"), which is indistinguishable from a crashed
// server or a proxy timeout. Sending the code lets the client tell a normal
// shutdown from a fault and decide whether reconnecting is worthwhile.
func closeGracefully(conn *websocket.Conn, code int, reason string) {
	_ = conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(code, reason),
		time.Now().Add(writeWait),
	)
}

// streamRedisChannels relays messages from one or more Redis pubsub channels
// to conn for as long as the connection is healthy. shouldSend decides
// whether a given decoded payload should reach this particular client — e.g.
// "is this device one I own", or unconditionally true when the channel is
// already scoped to this user, as user_alerts:<id> is.
func streamRedisChannels(conn *websocket.Conn, shouldSend func(payload map[string]interface{}) bool, channels ...string) {
	pubsub := db.RedisClient.Subscribe(db.Ctx, channels...)
	defer pubsub.Close()

	// Whatever ends the loop below, the peer gets a proper close frame.
	defer closeGracefully(conn, websocket.CloseNormalClosure, "")

	ch := pubsub.Channel()

	done := make(chan struct{})
	go readPump(conn, done)

	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			// Client disconnected or timed out.
			return

		case msg, ok := <-ch:
			if !ok {
				return
			}

			var payload map[string]interface{}
			if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
				continue
			}

			if !shouldSend(payload) {
				continue
			}

			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				log.Println("WebSocket write error:", err)
				return
			}

		case <-ticker.C:
			// Keepalive: also how we notice a peer that vanished without
			// sending a close frame.
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func HandleWebSocket(c *gin.Context) {
	// AuthMiddleware already validated the token (including the ?token= form
	// for WebSocket upgrades) and put the user id in the context.
	userID := c.GetInt("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get user's devices
	rows, err := db.DB.Query(`
        SELECT serial FROM devices WHERE user_id=$1`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	userDevices := make(map[string]bool)
	for rows.Next() {
		var serial string
		if err := rows.Scan(&serial); err == nil {
			userDevices[serial] = true
		}
	}
	rows.Close()

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Printf("User %d connected via WebSocket", userID)
	defer log.Printf("User %d disconnected from WebSocket", userID)

	_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
	if err := conn.WriteJSON(gin.H{"type": "connected", "message": "WebSocket connected"}); err != nil {
		return
	}

	// One socket, two feeds: this user's device locations plus their own
	// alert stream. user_alerts:<id> is already scoped to this user by how
	// it is published (see insertAlert in internal/mqtt/geofence.go), so any
	// message on it is admitted unconditionally; device_updates carries
	// every device on the system and still needs the ownership check.
	streamRedisChannels(conn, func(payload map[string]interface{}) bool {
		if payload["type"] == "alert" {
			return true
		}
		device, _ := payload["device"].(string)
		return device != "" && userDevices[device]
	}, "device_updates", "user_alerts:"+strconv.Itoa(userID))
}

func HandleDeviceWebSocket(c *gin.Context) {
	serial := c.Param("serial")
	userID := c.GetInt("user_id")

	// Verify ownership
	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Printf("User %d subscribed to device %s via WebSocket", userID, serial)
	defer log.Printf("User %d unsubscribed from device %s", userID, serial)

	streamRedisChannels(conn, func(payload map[string]interface{}) bool {
		device, _ := payload["device"].(string)
		return device == serial
	}, "device_updates")
}
