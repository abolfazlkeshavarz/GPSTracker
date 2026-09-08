package mqtt

import "testing"

func TestSeverityForTheftEventsIsCritical(t *testing.T) {
	// These are the ones that must wake a phone at 3am. If any of them ever
	// drops to a lower severity, push urgency drops with it and the
	// notification may simply not be delivered until the device next wakes.
	for _, kind := range []string{"impact", "sos", "power_cut", "tow", "jamming"} {
		if got := severityFor(kind); got != "critical" {
			t.Errorf("severityFor(%q) = %q, want critical", kind, got)
		}
	}
}

func TestSeverityForRoutineEventsIsNotCritical(t *testing.T) {
	// Turning the key must never be as loud as a collision.
	for _, kind := range []string{"ignition_on", "ignition_off", "back_online", "geofence_enter"} {
		if got := severityFor(kind); got != "info" {
			t.Errorf("severityFor(%q) = %q, want info", kind, got)
		}
	}
}

func TestSeverityForWarnings(t *testing.T) {
	for _, kind := range []string{"overspeed", "low_battery", "offline", "harsh_brake"} {
		if got := severityFor(kind); got != "warning" {
			t.Errorf("severityFor(%q) = %q, want warning", kind, got)
		}
	}
}

func TestSeverityForUnknownKindDefaultsToInfo(t *testing.T) {
	// A client seeing a kind it does not recognise should not be told it is
	// an emergency.
	if got := severityFor("something_new"); got != "info" {
		t.Errorf("severityFor(unknown) = %q, want info", got)
	}
}

func TestDefaultAlertSettingsMatchSchemaDefaults(t *testing.T) {
	s := defaultAlertSettings()

	// A speed limit of 0 means "no limit configured". If this ever defaulted
	// to a real number, every device would start alerting the day it shipped.
	if s.speedLimitKmh != 0 {
		t.Errorf("speedLimitKmh = %d, want 0 (rule disabled)", s.speedLimitKmh)
	}

	// Everything else defaults on: a customer who never opens the settings
	// screen must still be told their car is being towed.
	checks := map[string]bool{
		"overspeed": s.overspeed, "ignition": s.ignition, "tow": s.tow,
		"impact": s.impact, "harshDriving": s.harshDriving, "powerCut": s.powerCut,
		"jamming": s.jamming, "lowBattery": s.lowBattery, "geofence": s.geofence,
		"offline": s.offline,
	}
	for name, on := range checks {
		if !on {
			t.Errorf("%s defaults off, want on", name)
		}
	}

	if s.silent {
		t.Error("silent mode defaults on, want off")
	}
}
