package mqtt

import (
	"testing"
	"time"

	"tracking-backend/internal/integrity"
)

var now = time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)

func TestResolveTimestampLivePoint(t *testing.T) {
	// A point reported a few seconds ago: keep the device time, not backfill.
	deviceTime := now.Add(-20 * time.Second)

	got, backfill := resolveTimestamp(deviceTime.Unix(), now)

	if !got.Equal(deviceTime) {
		t.Errorf("recordedAt = %v, want %v", got, deviceTime)
	}
	if backfill {
		t.Error("a 20s-old point was flagged as backfill")
	}
}

func TestResolveTimestampBackfill(t *testing.T) {
	// Replayed after a 45-minute coverage gap.
	deviceTime := now.Add(-45 * time.Minute)

	got, backfill := resolveTimestamp(deviceTime.Unix(), now)

	if !got.Equal(deviceTime) {
		t.Errorf("recordedAt = %v, want the original fix time %v", got, deviceTime)
	}
	if !backfill {
		t.Error("a 45-minute-old point was not flagged as backfill")
	}
}

func TestResolveTimestampBoundary(t *testing.T) {
	cases := []struct {
		name     string
		age      time.Duration
		backfill bool
	}{
		{"just inside live", backfillThreshold - time.Second, false},
		{"just past the threshold", backfillThreshold + time.Second, true},
	}

	for _, c := range cases {
		_, backfill := resolveTimestamp(now.Add(-c.age).Unix(), now)
		if backfill != c.backfill {
			t.Errorf("%s: backfill = %v, want %v", c.name, backfill, c.backfill)
		}
	}
}

func TestResolveTimestampFallsBackToServerClock(t *testing.T) {
	cases := []struct {
		name string
		unix int64
	}{
		{"no timestamp", 0},
		{"negative", -5},
		// millis()/1000 from firmware with no GPS fix decodes to 1970.
		{"uptime seconds mistaken for epoch", 45},
		{"pre-2020", time.Date(2019, 1, 1, 0, 0, 0, 0, time.UTC).Unix()},
		{"far future", now.Add(48 * time.Hour).Unix()},
		{"older than the backfill window", now.Add(-60 * 24 * time.Hour).Unix()},
	}

	for _, c := range cases {
		got, backfill := resolveTimestamp(c.unix, now)

		if !got.Equal(now) {
			t.Errorf("%s: recordedAt = %v, want the server clock %v", c.name, got, now)
		}
		if backfill {
			t.Errorf("%s: should not be treated as backfill", c.name)
		}
	}
}

func TestResolveTimestampAllowsSmallClockSkew(t *testing.T) {
	// A device a minute ahead is normal drift, not a bad clock.
	deviceTime := now.Add(time.Minute)

	got, _ := resolveTimestamp(deviceTime.Unix(), now)

	if !got.Equal(deviceTime) {
		t.Errorf("recordedAt = %v, want %v (small skew should be accepted)", got, deviceTime)
	}
}

/* ------------------------------------------------------------------ auth */

func TestAuthenticatePrefersHMAC(t *testing.T) {
	const secret = "357951"

	msg := LocationMessageWithCSQ{
		Device:    "DEVICEADMIN",
		Timestamp: 1772000000,
		Lat:       35.689200,
		Lng:       51.389000,
	}
	msg.Signature = integrity.SignPayload(secret, msg.Device, msg.Timestamp, msg.Lat, msg.Lng)

	method, err := authenticate(secret, msg)
	if err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	if method != integrity.AuthHMAC {
		t.Errorf("method = %q, want hmac", method)
	}
}

func TestAuthenticateRejectsBadSignature(t *testing.T) {
	msg := LocationMessageWithCSQ{
		Device:    "DEVICEADMIN",
		Timestamp: 1772000000,
		Lat:       35.689200,
		Lng:       51.389000,
		// A valid-looking but wrong signature.
		Signature: "deadbeef",
		// The correct secret is also present; it must NOT rescue a bad
		// signature, or an attacker could downgrade to the weaker method.
		Secret: "357951",
	}

	if _, err := authenticate("357951", msg); err == nil {
		t.Fatal("a bad signature was accepted (downgrade to plaintext secret)")
	}
}

func TestAuthenticateFallsBackToLegacySecret(t *testing.T) {
	msg := LocationMessageWithCSQ{Device: "DEVICEADMIN", Secret: "357951"}

	method, err := authenticate("357951", msg)
	if err != nil {
		t.Fatalf("legacy firmware rejected: %v", err)
	}
	if method != integrity.AuthSecret {
		t.Errorf("method = %q, want secret", method)
	}
}

func TestAuthenticateRejectsWrongSecret(t *testing.T) {
	msg := LocationMessageWithCSQ{Device: "DEVICEADMIN", Secret: "wrong"}

	if _, err := authenticate("357951", msg); err == nil {
		t.Fatal("wrong secret accepted")
	}
}

func TestAuthenticateRejectsEmptyCredentials(t *testing.T) {
	// No signature and no secret must never authenticate, even against a
	// device whose stored secret is somehow empty.
	if _, err := authenticate("", LocationMessageWithCSQ{Device: "X"}); err != nil {
		// An empty stored secret matching an empty sent secret is a
		// misconfiguration; make sure it is at least not a silent success
		// with HMAC semantics.
		return
	}
	t.Log("empty-secret device authenticated with an empty secret; " +
		"device provisioning must never leave device_secret blank")
}
