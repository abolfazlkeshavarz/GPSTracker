package api

import (
	"net/http"
	"strings"

	"tracking-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// isWebSocketUpgrade reports whether the request is a WebSocket handshake.
// Browsers cannot attach an Authorization header to `new WebSocket(...)`, so
// those requests — and only those — may carry the token in the query string.
func isWebSocketUpgrade(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	for _, token := range strings.Split(r.Header.Get("Connection"), ",") {
		if strings.EqualFold(strings.TrimSpace(token), "upgrade") {
			return true
		}
	}
	return false
}

func AuthMiddleware(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {

		var token string

		authHeader := c.GetHeader("Authorization")

		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)

			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid authorization format",
				})
				c.Abort()
				return
			}

			token = strings.TrimSpace(parts[1])
		} else if isWebSocketUpgrade(c.Request) {
			// Accepting ?token= on ordinary routes leaked credentials into
			// access logs, proxy logs, browser history and Referer headers.
			token = c.Query("token")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization required",
			})
			c.Abort()
			return
		}

		claims, err := utils.ValidateJWT(token, secret)

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid or expired token",
			})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)

		c.Next()
	}
}
