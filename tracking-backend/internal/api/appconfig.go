package api

import (
	"database/sql"
	"net/http"
	"net/url"
	"os"
	"strings"

	"tracking-backend/internal/db"

	"github.com/gin-gonic/gin"
)

/*
Platform settings an admin can change at runtime.

The map server is the first: the web dashboard renders a vector style.json
(MapLibre) while the mobile app draws raster tiles, and both should follow
whatever map server the operator runs — without a rebuild of either client
when it moves. Clients read GET /api/app-config at start-up; an admin edits
it from the admin panel.
*/

// appConfigKeys lists every accepted key with its validator. A key not in
// this map cannot be written, so the table cannot become a dumping ground.
var appConfigKeys = map[string]func(string) bool{
	// MapLibre style for the web dashboard.
	"map_style_url": validHTTPURL,
	// Raster tile template for the mobile app: must contain {z}, {x}, {y}.
	"map_tile_url": func(v string) bool {
		return validHTTPURL(strings.NewReplacer("{z}", "0", "{x}", "0", "{y}", "0").Replace(v)) &&
			strings.Contains(v, "{z}") && strings.Contains(v, "{x}") && strings.Contains(v, "{y}")
	},
	// Attribution shown on the map; required by most tile licences.
	"map_attribution": func(v string) bool { return len(v) <= 200 },
}

// appConfigDefaults are used for any key not stored in the database. They
// come from the environment so a deployment can set them without the admin
// panel, and fall back to the project's own tile server.
func appConfigDefaults() map[string]string {
	return map[string]string{
		"map_style_url":   envOr("MAP_STYLE_URL", "https://maps.abolfazl.fun/styles/osm-bright/style.json"),
		"map_tile_url":    envOr("MAP_TILE_URL", "https://maps.abolfazl.fun/styles/osm-bright/{z}/{x}/{y}.png"),
		"map_attribution": envOr("MAP_ATTRIBUTION", "© OpenStreetMap contributors"),
	}
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func validHTTPURL(v string) bool {
	u, err := url.Parse(strings.TrimSpace(v))
	if err != nil || u.Host == "" || u.User != nil {
		return false
	}
	// Plain http is tolerated outside production for a local tile server.
	return u.Scheme == "https" || (u.Scheme == "http" && os.Getenv("APP_ENV") != "production")
}

// loadAppConfig returns every setting, plus "configured": a comma-separated
// list of the keys an admin has explicitly set. Clients use it to decide
// whether the server value should beat their own build-time default (for
// example a developer's local tile server).
func loadAppConfig() (map[string]string, error) {
	cfg := appConfigDefaults()
	configured := []string{}
	defer func() { cfg["configured"] = strings.Join(configured, ",") }()
	rows, err := db.DB.Query("SELECT key, value FROM app_config")
	if err != nil {
		return cfg, err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if rows.Scan(&k, &v) == nil {
			if _, known := appConfigKeys[k]; known {
				cfg[k] = v
				configured = append(configured, k)
			}
		}
	}
	return cfg, rows.Err()
}

// GetAppConfig is public: clients need the map server before sign-in, and
// nothing in it is secret.
func GetAppConfig(c *gin.Context) {
	cfg, err := loadAppConfig()
	if err != nil && err != sql.ErrNoRows {
		// Serve the defaults rather than leave every client without a map.
		c.Header("X-Config-Source", "defaults")
	}
	c.Header("Cache-Control", "public, max-age=300")
	c.JSON(http.StatusOK, cfg)
}

// AdminUpdateAppConfig sets one or more keys. An empty string resets a key
// to its default.
func AdminUpdateAppConfig(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Expected a JSON object of settings"})
		return
	}

	for k, v := range req {
		valid, known := appConfigKeys[k]
		if !known {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown setting: " + k})
			return
		}
		if v = strings.TrimSpace(v); v != "" && !valid(v) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid value for " + k})
			return
		}
	}

	tx, err := db.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer tx.Rollback()

	userID := c.GetInt("user_id")
	for k, v := range req {
		v = strings.TrimSpace(v)
		if v == "" {
			_, err = tx.Exec("DELETE FROM app_config WHERE key = $1", k)
		} else {
			_, err = tx.Exec(`
                INSERT INTO app_config (key, value, updated_by, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
				k, v, userID)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save settings"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save settings"})
		return
	}

	logAdminAction(c, "UPDATE_APP_CONFIG", "app_config", "", req)

	cfg, _ := loadAppConfig()
	c.JSON(http.StatusOK, cfg)
}
