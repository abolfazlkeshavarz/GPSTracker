package services

import (
	"math"
	"testing"
)

func TestOdometerIncrementCountsARealHop(t *testing.T) {
	// ~111 m south: well above the noise floor, well below the max hop.
	meters, advance := OdometerIncrement(35.6892, 51.3890, 35.6882, 51.3890)

	if !advance {
		t.Fatal("a 111 m hop did not advance the anchor")
	}
	if math.Abs(meters-111) > 5 {
		t.Errorf("meters = %.1f, want ~111", meters)
	}
}

func TestOdometerIncrementIgnoresDrift(t *testing.T) {
	// ~3 m of stationary GPS jitter must neither count nor move the anchor,
	// or a parked vehicle accrues kilometres overnight.
	meters, advance := OdometerIncrement(35.68920, 51.38900, 35.68922, 51.38902)

	if advance {
		t.Error("sub-noise-floor jitter moved the anchor")
	}
	if meters != 0 {
		t.Errorf("meters = %v, want 0 for drift", meters)
	}
}

func TestOdometerIncrementRejectsTeleport(t *testing.T) {
	// A GPS glitch or a cold start in a new city: advance the anchor so the
	// counter resumes from the new position, but do not count the jump.
	meters, advance := OdometerIncrement(35.6892, 51.3890, 40.0000, 60.0000)

	if !advance {
		t.Error("a teleport should still move the anchor to the new position")
	}
	if meters != 0 {
		t.Errorf("meters = %v, want 0 — an implausible jump must not be counted", meters)
	}
}

func TestOdometerIncrementBoundaries(t *testing.T) {
	// Just below the noise floor: ignored. Just above: counted.
	// 0.00005 deg latitude is ~5.6 m; 0.0001 deg is ~11.1 m.
	if _, advance := OdometerIncrement(35.0, 51.0, 35.00005, 51.0); advance {
		t.Error("~5.6 m hop should be below the noise floor")
	}
	if _, advance := OdometerIncrement(35.0, 51.0, 35.0001, 51.0); !advance {
		t.Error("~11.1 m hop should be counted")
	}
}
