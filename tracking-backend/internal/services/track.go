package services

import (
	"fmt"
	"math"
	"sort"
	"time"

	"tracking-backend/internal/models"
)

const earthRadiusMeters = 6371000.0

// Defaults for stop detection, chosen for vehicle tracking with a ~30s
// reporting interval.
const (
	// DefaultStopRadiusMeters is how far fixes may wander and still count as
	// the same place. A stationary consumer GPS typically drifts 10-40m, so a
	// smaller radius would split one parking event into several.
	DefaultStopRadiusMeters = 60.0

	// DefaultMinStopSeconds is the shortest dwell reported as a stop. Below
	// this, traffic lights and junctions dominate the results.
	DefaultMinStopSeconds = 180

	// noiseFloorMeters discards sub-GPS-precision hops so that a vehicle
	// parked overnight does not accumulate kilometres of phantom distance.
	noiseFloorMeters = 8.0
)

// TrackOptions tunes stop detection.
type TrackOptions struct {
	StopRadiusMeters float64
	MinStopSeconds   int
}

// DefaultTrackOptions returns the standard tuning.
func DefaultTrackOptions() TrackOptions {
	return TrackOptions{
		StopRadiusMeters: DefaultStopRadiusMeters,
		MinStopSeconds:   DefaultMinStopSeconds,
	}
}

// HaversineMeters returns the great-circle distance between two coordinates.
func HaversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const toRad = math.Pi / 180

	dLat := (lat2 - lat1) * toRad
	dLng := (lng2 - lng1) * toRad

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*toRad)*math.Cos(lat2*toRad)*
			math.Sin(dLng/2)*math.Sin(dLng/2)

	return 2 * earthRadiusMeters * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// BuildTrack derives stops and a summary from an ordered list of fixes.
//
// Points are sorted ascending by time first, so callers may pass them in any
// order. The input slice is not modified.
func BuildTrack(points []models.TrackPoint, opts TrackOptions) ([]models.TrackStop, models.TrackSummary) {
	if opts.StopRadiusMeters <= 0 {
		opts.StopRadiusMeters = DefaultStopRadiusMeters
	}
	if opts.MinStopSeconds <= 0 {
		opts.MinStopSeconds = DefaultMinStopSeconds
	}

	stops := []models.TrackStop{}
	summary := models.TrackSummary{PointCount: len(points)}

	if len(points) == 0 {
		return stops, summary
	}

	sorted := make([]models.TrackPoint, len(points))
	copy(sorted, points)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].RecordedAt.Before(sorted[j].RecordedAt)
	})

	summary.FirstRecordedAt = sorted[0].RecordedAt
	summary.LastRecordedAt = sorted[len(sorted)-1].RecordedAt
	summary.TotalSeconds = int(summary.LastRecordedAt.Sub(summary.FirstRecordedAt).Seconds())

	// stopOf[i] is the index of the stop point i belongs to, or -1 when moving.
	stopOf := make([]int, len(sorted))
	for i := range stopOf {
		stopOf[i] = -1
	}

	// Sweep forward, greedily extending a cluster while every fix stays
	// within the radius of the cluster's anchor. A run that lasts at least
	// MinStopSeconds becomes a stop.
	for i := 0; i < len(sorted); {
		anchor := sorted[i]
		j := i

		for j+1 < len(sorted) {
			next := sorted[j+1]
			if HaversineMeters(anchor.Lat, anchor.Lng, next.Lat, next.Lng) > opts.StopRadiusMeters {
				break
			}
			j++
		}

		dwell := sorted[j].RecordedAt.Sub(sorted[i].RecordedAt)

		if j > i && int(dwell.Seconds()) >= opts.MinStopSeconds {
			// Average the cluster so the marker sits in the middle of the
			// drift rather than on whichever fix happened to arrive first.
			var sumLat, sumLng float64
			for k := i; k <= j; k++ {
				sumLat += sorted[k].Lat
				sumLng += sorted[k].Lng
				stopOf[k] = len(stops)
			}

			count := j - i + 1
			seconds := int(dwell.Seconds())

			stops = append(stops, models.TrackStop{
				Lat:             sumLat / float64(count),
				Lng:             sumLng / float64(count),
				ArrivedAt:       sorted[i].RecordedAt,
				DepartedAt:      sorted[j].RecordedAt,
				DurationSeconds: seconds,
				Duration:        FormatDuration(seconds),
				PointCount:      count,
			})

			summary.StoppedSeconds += seconds
			i = j + 1
			continue
		}

		// Not a stop: advance one point so a slow crawl is not swallowed.
		i++
	}

	// Distance, skipping hops inside a single stop (that is drift, not travel)
	// and hops below the noise floor.
	var meters float64
	for i := 1; i < len(sorted); i++ {
		if stopOf[i] >= 0 && stopOf[i] == stopOf[i-1] {
			continue
		}

		d := HaversineMeters(sorted[i-1].Lat, sorted[i-1].Lng, sorted[i].Lat, sorted[i].Lng)
		if d >= noiseFloorMeters {
			meters += d
		}
	}

	summary.DistanceKm = math.Round(meters/10) / 100 // metres -> km, 2 dp
	summary.StopCount = len(stops)

	summary.MovingSeconds = summary.TotalSeconds - summary.StoppedSeconds
	if summary.MovingSeconds < 0 {
		summary.MovingSeconds = 0
	}

	for _, p := range sorted {
		if p.Speed > summary.MaxSpeed {
			summary.MaxSpeed = p.Speed
		}
	}

	if summary.MovingSeconds > 0 {
		hours := float64(summary.MovingSeconds) / 3600
		summary.AvgMovingSpeed = int(math.Round(summary.DistanceKm / hours))
	}

	summary.TotalDuration = FormatDuration(summary.TotalSeconds)
	summary.MovingDuration = FormatDuration(summary.MovingSeconds)
	summary.StoppedDuration = FormatDuration(summary.StoppedSeconds)

	return stops, summary
}

// FormatDuration renders a second count as a compact human string.
func FormatDuration(seconds int) string {
	if seconds < 0 {
		seconds = 0
	}

	d := time.Duration(seconds) * time.Second

	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	secs := seconds % 60

	switch {
	case days > 0:
		return fmt.Sprintf("%dd %dh", days, hours)
	case hours > 0:
		return fmt.Sprintf("%dh %dm", hours, minutes)
	case minutes > 0:
		return fmt.Sprintf("%dm", minutes)
	default:
		return fmt.Sprintf("%ds", secs)
	}
}
