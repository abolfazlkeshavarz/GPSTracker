package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// clampedIntQuery reads an integer query parameter, falling back to def when it
// is absent or unparseable and clamping the result to [min, max].
//
// These values used to be passed straight into SQL as strings: a non-numeric
// limit produced a 500, and an enormous one let a single request pull the whole
// table into memory.
func clampedIntQuery(c *gin.Context, name string, def, min, max int) int {
	raw := c.Query(name)
	if raw == "" {
		return def
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}

	if value < min {
		return min
	}
	if value > max {
		return max
	}

	return value
}

// parseIDParam validates a path parameter that must be a positive integer.
func parseIDParam(c *gin.Context, name string) (int, bool) {
	value, err := strconv.Atoi(c.Param(name))
	if err != nil || value <= 0 {
		return 0, false
	}
	return value, true
}
