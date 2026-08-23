package services

import "testing"

func TestPointInCircleCenter(t *testing.T) {
	if !PointInCircle(35.6892, 51.3890, 35.6892, 51.3890, 50) {
		t.Fatal("the centre point must be inside its own circle")
	}
}

func TestPointInCircleWithinRadius(t *testing.T) {
	// ~55m north of the centre (0.0005 deg lat ~= 55.6m).
	if !PointInCircle(35.68970, 51.3890, 35.6892, 51.3890, 100) {
		t.Fatal("a point ~55m from centre should be inside a 100m radius")
	}
}

func TestPointInCircleOutsideRadius(t *testing.T) {
	// ~1.1km north of the centre.
	if PointInCircle(35.7000, 51.3890, 35.6892, 51.3890, 100) {
		t.Fatal("a point ~1.1km from centre should be outside a 100m radius")
	}
}

func TestPointInCircleExactBoundary(t *testing.T) {
	// A point placed to land within float precision of the boundary must be
	// treated consistently by the <= comparison (inclusive of the edge).
	const radius = 1000.0
	// Roughly 1000m due north.
	lat := 35.6892 + (radius/earthRadiusMeters)*(180/3.141592653589793)
	d := HaversineMeters(lat, 51.3890, 35.6892, 51.3890)
	got := PointInCircle(lat, 51.3890, 35.6892, 51.3890, d)
	if !got {
		t.Fatal("a point exactly at the radius distance should count as inside (<=)")
	}
}

func TestEvaluateCrossingNoPriorState(t *testing.T) {
	// First point ever seen for this geofence: must record state, not fire.
	crossing, hasPrior := EvaluateCrossing(nil, true)

	if hasPrior {
		t.Fatal("nil prior state must report hasPriorState=false")
	}
	if crossing.Entered || crossing.Exited {
		t.Fatal("a first observation must never itself be a crossing")
	}
}

func TestEvaluateCrossingEnter(t *testing.T) {
	wasOutside := false
	crossing, hasPrior := EvaluateCrossing(&wasOutside, true)

	if !hasPrior {
		t.Fatal("expected hasPriorState=true")
	}
	if !crossing.Entered || crossing.Exited {
		t.Fatalf("outside -> inside should be Entered only, got %+v", crossing)
	}
}

func TestEvaluateCrossingExit(t *testing.T) {
	wasInside := true
	crossing, hasPrior := EvaluateCrossing(&wasInside, false)

	if !hasPrior {
		t.Fatal("expected hasPriorState=true")
	}
	if !crossing.Exited || crossing.Entered {
		t.Fatalf("inside -> outside should be Exited only, got %+v", crossing)
	}
}

func TestEvaluateCrossingNoChange(t *testing.T) {
	for _, state := range []bool{true, false} {
		crossing, hasPrior := EvaluateCrossing(&state, state)
		if !hasPrior {
			t.Fatal("expected hasPriorState=true")
		}
		if crossing.Entered || crossing.Exited {
			t.Errorf("state=%v -> %v should not be a crossing, got %+v", state, state, crossing)
		}
	}
}
