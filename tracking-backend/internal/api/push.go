package api

import (
	"net/http"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/push"

	"github.com/gin-gonic/gin"
)

/*
Web Push registration.

The browser does the cryptography: PushManager.subscribe() generates a key
pair, keeps the private half, and hands us the endpoint plus the public half.
We store exactly that. The rows here cannot be used to read anything — they
are what payloads get encrypted *to*.
*/

// GetVAPIDKey returns the application server key the browser needs in order
// to subscribe, and whether push is configured at all.
//
// Unauthenticated on purpose: it is a public key, and the client needs it
// before it can meaningfully offer to turn notifications on.
func GetVAPIDKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":    push.Enabled(),
		"public_key": push.PublicKey(),
	})
}

// SubscribePush registers one browser/PWA install for the caller.
func SubscribePush(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req models.PushSubscribeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// The endpoint is unique per browser install. ON CONFLICT re-points it at
	// the current user and refreshes the keys, which is what happens when a
	// second account signs in on the same device, or when the browser rotates
	// a subscription without the app noticing.
	userAgent := c.Request.UserAgent()
	if len(userAgent) > 200 {
		userAgent = userAgent[:200]
	}

	var id int64
	err := db.DB.QueryRow(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
        VALUES ($1, $2, $3, $4, NULLIF($5, ''))
        ON CONFLICT (endpoint) DO UPDATE
            SET user_id = EXCLUDED.user_id,
                p256dh  = EXCLUDED.p256dh,
                auth    = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent
        RETURNING id`,
		userID, req.Endpoint, req.Keys.P256dh, req.Keys.Auth, userAgent,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save subscription"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Push subscription saved"})
}

// UnsubscribePush removes one endpoint.
//
// Scoped to the caller's own rows: an endpoint string is not a secret, and
// without the user_id clause anyone could unsubscribe anyone.
func UnsubscribePush(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Endpoint string `json:"endpoint" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := db.DB.Exec(
		"DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
		req.Endpoint, userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Push subscription removed"})
}

// TestPush sends a notification to the caller's own devices.
//
// Worth having as a real endpoint rather than a debug script: "did I actually
// enable notifications?" is unanswerable otherwise until something goes wrong
// at 3am, which is the worst possible time to discover the answer is no.
func TestPush(c *gin.Context) {
	userID := c.GetInt("user_id")

	if !push.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "Push notifications are not configured on this server",
		})
		return
	}

	var count int
	if err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM push_subscriptions WHERE user_id = $1", userID,
	).Scan(&count); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "No devices are registered for notifications on this account",
		})
		return
	}

	push.SendToUser(db.DB, int64(userID), push.Payload{
		Type:     "test",
		Severity: "info",
		Title:    "Notifications are working",
		Body:     "You will be alerted here if something happens to your vehicle.",
		URL:      "/alerts",
	})

	c.JSON(http.StatusOK, gin.H{"message": "Test notification sent", "devices": count})
}
