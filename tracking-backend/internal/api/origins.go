package api

import (
	"os"
	"strings"
	"sync"
)

// defaultAllowedOrigins is the built-in allowlist. Extra origins can be added
// at deploy time via the ALLOWED_ORIGINS env var (comma separated).
var defaultAllowedOrigins = []string{
	"http://localhost",
	"http://localhost:80",
	"http://localhost:3000",
	"http://localhost:5173",
	"http://127.0.0.1",
	"http://127.0.0.1:80",
	"http://127.0.0.1:5173",
	"http://abolfazl.fun",
	"http://diceandroll.ir",
	"https://abolfazl.fun",
	"https://diceandroll.ir",
	"https://maps.abolfazl.fun",
}

var (
	allowedOriginsOnce sync.Once
	allowedOrigins     map[string]bool
)

func originAllowlist() map[string]bool {
	allowedOriginsOnce.Do(func() {
		allowedOrigins = make(map[string]bool, len(defaultAllowedOrigins))

		for _, origin := range defaultAllowedOrigins {
			allowedOrigins[origin] = true
		}

		for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
			if origin = strings.TrimSpace(origin); origin != "" {
				allowedOrigins[origin] = true
			}
		}
	})

	return allowedOrigins
}

// IsOriginAllowed is the single source of truth for both the CORS middleware
// and the WebSocket upgrader, so the two can never drift apart.
func IsOriginAllowed(origin string) bool {
	return originAllowlist()[origin]
}
