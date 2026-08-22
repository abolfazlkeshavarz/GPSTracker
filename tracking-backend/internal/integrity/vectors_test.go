package integrity

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

/*
Cross-language contract with the firmware.

The device (C++ on ESP32) and this package must build byte-identical signing
input, or every point from real hardware is rejected. These tests pin the
format down so a change here fails loudly instead of silently breaking the
deployed fleet.

The firmware equivalent is in buildPayload(),
firmware/GPS-SIM800C-MQTT-DC-v3.ino:

    snprintf(signable, sizeof(signable), "%s|%lu|%.6f|%.6f",
             DEVICE_NAME, (unsigned long)ts, la, ln);
*/

// hmacHex is an independent implementation, written out longhand rather than
// calling SignPayload — otherwise the test would just be comparing the
// function to itself and could not catch a format change.
func hmacHex(secret, message string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// TestSigningInputFormat pins the exact string that gets signed.
//
// Asserted separately from the HMAC itself so a failure reads "the format
// changed" rather than "some hash differs".
func TestSigningInputFormat(t *testing.T) {
	const (
		secret = "357951"
		device = "DEVICEADMIN"
		ts     = int64(1772000000)
	)
	lat, lng := 35.6892, 51.389

	// Exactly what the firmware assembles with snprintf.
	expectedMessage := "DEVICEADMIN|1772000000|35.689200|51.389000"

	if got, want := SignPayload(secret, device, ts, lat, lng), hmacHex(secret, expectedMessage); got != want {
		t.Fatalf(
			"the signed message is no longer %q.\n"+
				"The firmware signs exactly this string; changing it invalidates "+
				"every deployed device until it is reflashed.",
			expectedMessage)
	}
}

func TestSignatureIsDeterministicAndWellFormed(t *testing.T) {
	sig := SignPayload("357951", "DEVICEADMIN", 1772000000, 35.6892, 51.389)

	if len(sig) != 64 {
		t.Errorf("signature length = %d, want 64 hex characters", len(sig))
	}

	if again := SignPayload("357951", "DEVICEADMIN", 1772000000, 35.6892, 51.389); again != sig {
		t.Error("signing the same input twice produced different output")
	}
}

// TestSigningRoundsToSixPlaces documents that coordinates are signed at six
// decimal places (~11 cm, far finer than consumer GPS), and is why the
// firmware rounds before signing.
func TestSigningRoundsToSixPlaces(t *testing.T) {
	const secret = "s"

	// Values differing only past the sixth decimal render identically under
	// "%.6f", so they must sign identically.
	a := SignPayload(secret, "D", 1, 35.68920001, 51.38900001)
	b := SignPayload(secret, "D", 1, 35.68920002, 51.38900002)

	if a != b {
		t.Error("values differing below 1e-6 signed differently; firmware and " +
			"server would disagree on rounding boundaries")
	}

	// A change at the sixth decimal must be covered.
	if c := SignPayload(secret, "D", 1, 35.689201, 51.389000); a == c {
		t.Error("a 1e-6 coordinate change did not alter the signature")
	}
}

// TestCanonicalRecordFormat pins the chain hash input, which any independent
// verifier must reproduce exactly.
func TestCanonicalRecordFormat(t *testing.T) {
	r := Record{
		DeviceSerial: "TRACKER-001",
		RecordedAt:   base,
		Lat:          35.6892,
		Lng:          51.389,
		Speed:        45,
		Satellites:   9,
		CSQ:          22,
		Battery:      12.4,
		AuthMethod:   AuthHMAC,
	}

	want := "v1|TRACKER-001|2026-03-01T09:00:00Z|35.689200|51.389000|45|9|22|12.40|null|null|false|hmac|"

	if got := r.canonical(); got != want {
		t.Fatalf("canonical form changed.\n got: %s\nwant: %s\n\n"+
			"Every stored hash was computed with the old format; changing this "+
			"invalidates verification of all existing history.", got, want)
	}
}
