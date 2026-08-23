package services

// Point implements simple point-in-circle geofencing.
//
// A circle is the only shape that needs no polygon library: containment is
// one haversine distance and one comparison. That keeps the check cheap
// enough to run against every active geofence on every ingested point,
// without needing a spatial index.

// PointInCircle reports whether (lat, lng) is within radiusM metres of the
// circle centred at (centerLat, centerLng).
func PointInCircle(lat, lng, centerLat, centerLng float64, radiusM float64) bool {
	return HaversineMeters(lat, lng, centerLat, centerLng) <= radiusM
}

// GeofenceCrossing is what changed for one geofence between two consecutive
// points.
type GeofenceCrossing struct {
	Entered bool
	Exited  bool
}

// EvaluateCrossing compares the previous and current containment state and
// reports which edge, if either, was crossed.
//
// wasInside is a pointer because a geofence with no prior recorded state
// (the device's first point since the fence was created) must not fire —
// there is nothing to have transitioned *from*, so only the state is
// recorded, not an alert raised.
func EvaluateCrossing(wasInside *bool, isInsideNow bool) (crossing GeofenceCrossing, hasPriorState bool) {
	if wasInside == nil {
		return GeofenceCrossing{}, false
	}

	if !*wasInside && isInsideNow {
		return GeofenceCrossing{Entered: true}, true
	}
	if *wasInside && !isInsideNow {
		return GeofenceCrossing{Exited: true}, true
	}

	return GeofenceCrossing{}, true
}
