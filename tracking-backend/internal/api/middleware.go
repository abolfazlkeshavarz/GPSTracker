package api

import (
	"net/http"
	"strings"

	"tracking-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {

		var token string

		// WebSocket token
		queryToken := c.Query("token")

		if queryToken != "" {
			token = queryToken
		} else {

			authHeader := c.GetHeader("Authorization")

			if authHeader == "" {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Authorization required",
				})
				c.Abort()
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)

			if len(parts) != 2 || parts[0] != "Bearer" {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid authorization format",
				})
				c.Abort()
				return
			}

			token = parts[1]
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