package services

import (
	"math"
	"testing"
	"time"

	"tracking-backend/internal/models"
)

var base = time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)

// pt builds a fix at minute offset m from base.
func pt(m int, lat, lng float64, speed int) models.TrackPoint {
	return models.TrackPoint{
		Lat:        lat,
		Lng:        lng,
		Speed:      speed,
		RecordedAt: base.Add(time.Duration(m) * time.Minute),
	}
}

func TestHaversineMeters(t *testing.T) {
	// One degree of latitude is ~111.2 km anywhere on the globe.
	got := HaversineMeters(35.0, 51.0, 36.0, 51.0)
	if math.Abs(got-111195) > 500 {
		t.Errorf("1 degree latitude = %.0f m, want ~111195 m", got)
	}

	if d := HaversineMeters(35.6892, 51.3890, 35.6892, 51.3890); d != 0 {
		t.Errorf("distance to self = %v, want 0", d)
	}
}

func TestBuildTrackEmpty(t *testing.T) {
	stops, summary := BuildTrack(nil, DefaultTrackOptions())

	if len(stops) != 0 {
		t.Errorf("stops = %d, want 0", len(stops))
	}
	if summary.PointCount != 0 || summary.DistanceKm != 0 {
		t.Errorf("summary = %+v, want zero values", summary)
	}
}

func TestBuildTrackSinglePointHasNoStop(t *testing.T) {
	// A lone fix carries no duration, so it cannot establish a dwell.
	stops, summary := BuildTrack([]models.TrackPoint{pt(0, 35.6892, 51.3890, 0)}, DefaultTrackOptions())

	if len(stops) != 0 {
		t.Errorf("stops = %d, want 0", len(stops))
	}
	if summary.PointCount != 1 {
		t.Errorf("PointCount = %d, want 1", summary.PointCount)
	}
}

func TestBuildTrackDetectsStop(t *testing.T) {
	// Parked at one spot for 30 minutes, then drives away.
	points := []models.TrackPoint{
		pt(0, 35.6892, 51.3890, 0),
		pt(10, 35.68921, 51.38901, 0),
		pt(20, 35.68919, 51.38899, 0),
		pt(30, 35.68920, 51.38900, 0),
		pt(40, 35.7100, 51.4100, 60), // ~3 km away
	}

	stops, summary := BuildTrack(points, DefaultTrackOptions())

	if len(stops) != 1 {
		t.Fatalf("stops = %d, want 1", len(stops))
	}

	s := stops[0]
	if s.DurationSeconds != 30*60 {
		t.Errorf("DurationSeconds = %d, want %d", s.DurationSeconds, 30*60)
	}
	if s.Duration != "30m" {
		t.Errorf("Duration = %q, want \"30m\"", s.Duration)
	}
	if s.PointCount != 4 {
		t.Errorf("PointCount = %d, want 4", s.PointCount)
	}
	if summary.StoppedSeconds != 30*60 {
		t.Errorf("StoppedSeconds = %d, want %d", summary.StoppedSeconds, 30*60)
	}

	// The stop marker should sit within the drift cluster.
	if math.Abs(s.Lat-35.6892) > 0.001 || math.Abs(s.Lng-51.3890) > 0.001 {
		t.Errorf("stop centroid = (%f, %f), want near (35.6892, 51.3890)", s.Lat, s.Lng)
	}
}

func TestBuildTrackIgnoresShortDwell(t *testing.T) {
	// Two minutes at a traffic light is not a stop.
	points := []models.TrackPoint{
		pt(0, 35.6892, 51.3890, 0),
		pt(1, 35.68921, 51.38901, 0),
		pt(2, 35.68920, 51.38900, 0),
		pt(10, 35.7100, 51.4100, 50),
	}

	stops, _ := BuildTrack(points, DefaultTrackOptions())
	if len(stops) != 0 {
		t.Errorf("stops = %d, want 0 (dwell shorter than the minimum)", len(stops))
	}
}

func TestBuildTrackMultipleStops(t *testing.T) {
	points := []models.TrackPoint{
		// Stop A: 08:00 - 08:20
		pt(0, 35.6892, 51.3890, 0),
		pt(10, 35.68921, 51.38901, 0),
		pt(20, 35.68919, 51.38899, 0),
		// Driving
		pt(30, 35.7000, 51.4000, 45),
		// Stop B: 08:40 - 09:10
		pt(40, 35.7500, 51.4500, 0),
		pt(55, 35.75001, 51.45001, 0),
		pt(70, 35.74999, 51.44999, 0),
		// Driving away
		pt(80, 35.8000, 51.5000, 55),
	}

	stops, summary := BuildTrack(points, DefaultTrackOptions())

	if len(stops) != 2 {
		t.Fatalf("stops = %d, want 2", len(stops))
	}
	if stops[0].DurationSeconds != 20*60 {
		t.Errorf("stop[0] = %ds, want %ds", stops[0].DurationSeconds, 20*60)
	}
	if stops[1].DurationSeconds != 30*60 {
		t.Errorf("stop[1] = %ds, want %ds", stops[1].DurationSeconds, 30*60)
	}

	// Stops must come back in chronological order for the timeline UI.
	if !stops[0].ArrivedAt.Before(stops[1].ArrivedAt) {
		t.Error("stops are not in chronological order")
	}
	if summary.StopCount != 2 {
		t.Errorf("StopCount = %d, want 2", summary.StopCount)
	}
}

func TestBuildTrackDriftDoesNotAccumulateDistance(t *testing.T) {
	// A vehicle parked overnight, jittering within a few metres. Naively
	// summing consecutive distances would report kilometres of travel.
	points := []models.TrackPoint{}
	for i := 0; i <= 60; i++ {
		jitter := float64(i%3) * 0.00002 // ~2 m
		points = append(points, pt(i*10, 35.6892+jitter, 51.3890+jitter, 0))
	}

	_, summary := BuildTrack(points, DefaultTrackOptions())

	if summary.DistanceKm > 0.05 {
		t.Errorf("DistanceKm = %v, want ~0 for a stationary vehicle", summary.DistanceKm)
	}
}

func TestBuildTrackDistance(t *testing.T) {
	// Two fixes 1 degree of latitude apart, ~111.2 km.
	points := []models.TrackPoint{
		pt(0, 35.0, 51.0, 80),
		pt(60, 36.0, 51.0, 80),
	}

	_, summary := BuildTrack(points, DefaultTrackOptions())

	if math.Abs(summary.DistanceKm-111.2) > 1 {
		t.Errorf("DistanceKm = %v, want ~111.2", summary.DistanceKm)
	}
	if summary.MaxSpeed != 80 {
		t.Errorf("MaxSpeed = %d, want 80", summary.MaxSpeed)
	}
}

func TestBuildTrackSortsUnorderedInput(t *testing.T) {
	points := []models.TrackPoint{
		pt(40, 35.7100, 51.4100, 60),
		pt(0, 35.6892, 51.3890, 0),
		pt(20, 35.68919, 51.38899, 0),
		pt(10, 35.68921, 51.38901, 0),
	}

	stops, summary := BuildTrack(points, DefaultTrackOptions())

	if !summary.FirstRecordedAt.Equal(base) {
		t.Errorf("FirstRecordedAt = %v, want %v", summary.FirstRecordedAt, base)
	}
	if len(stops) != 1 {
		t.Fatalf("stops = %d, want 1 after sorting", len(stops))
	}
}

func TestBuildTrackDoesNotMutateInput(t *testing.T) {
	points := []models.TrackPoint{
		pt(40, 35.71, 51.41, 60),
		pt(0, 35.6892, 51.3890, 0),
	}
	first := points[0].RecordedAt

	BuildTrack(points, DefaultTrackOptions())

	if !points[0].RecordedAt.Equal(first) {
		t.Error("BuildTrack reordered the caller's slice")
	}
}

func TestFormatDuration(t *testing.T) {
	cases := []struct {
		seconds int
		want    string
	}{
		{0, "0s"},
		{45, "45s"},
		{60, "1m"},
		{90, "1m"},
		{3600, "1h 0m"},
		{5040, "1h 24m"},
		{86400, "1d 0h"},
		{90000, "1d 1h"},
		{-5, "0s"},
	}

	for _, c := range cases {
		if got := FormatDuration(c.seconds); got != c.want {
			t.Errorf("FormatDuration(%d) = %q, want %q", c.seconds, got, c.want)
		}
	}
}
