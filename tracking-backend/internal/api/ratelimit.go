package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// visitor is a token bucket for one client IP.
type visitor struct {
	tokens   float64
	lastSeen time.Time
}

// rateLimiter is an in-memory per-IP token bucket. It protects the endpoints
// that verify a secret (login, register, device activation) from unlimited
// brute-force attempts. Single-instance only — put a limiter in the reverse
// proxy too if the backend is ever scaled horizontally.
type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor

	burst    float64 // bucket size
	refill   float64 // tokens restored per second
	stopOnce sync.Once
	stop     chan struct{}
}

func newRateLimiter(burst int, per time.Duration) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		burst:    float64(burst),
		refill:   float64(burst) / per.Seconds(),
		stop:     make(chan struct{}),
	}

	go rl.cleanupLoop()

	return rl
}

// cleanupLoop drops idle buckets so the map cannot grow without bound.
func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cutoff := time.Now().Add(-15 * time.Minute)

			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if v.lastSeen.Before(cutoff) {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()

		case <-rl.stop:
			return
		}
	}
}

func (rl *rateLimiter) Stop() {
	rl.stopOnce.Do(func() { close(rl.stop) })
}

// allow consumes one token for ip, reporting whether the request may proceed.
func (rl *rateLimiter) allow(ip string) bool {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, ok := rl.visitors[ip]
	if !ok {
		rl.visitors[ip] = &visitor{tokens: rl.burst - 1, lastSeen: now}
		return true
	}

	// Refill proportionally to the time elapsed since the last request.
	v.tokens += now.Sub(v.lastSeen).Seconds() * rl.refill
	if v.tokens > rl.burst {
		v.tokens = rl.burst
	}
	v.lastSeen = now

	if v.tokens < 1 {
		return false
	}

	v.tokens--
	return true
}

// RateLimitMiddleware limits each client IP to burst requests per window.
func RateLimitMiddleware(burst int, per time.Duration) gin.HandlerFunc {
	rl := newRateLimiter(burst, per)

	return func(c *gin.Context) {
		if !rl.allow(c.ClientIP()) {
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests, please try again later",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
