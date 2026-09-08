// Package integrity turns stored location history into evidence.
//
// Two mechanisms, deliberately separate:
//
//   - Device authentication (HMAC): proves a point came from the device that
//     holds the secret, and that nobody altered it in flight. Replaces sending
//     the shared secret in cleartext on every message.
//
//   - The hash chain: proves nothing has been altered *after* storage —
//     including by someone with database access. Each record is hashed with
//     the hash before it, so editing or deleting any row invalidates every
//     hash that follows.
//
// The chain is ordered by ingest sequence, not by recorded_at. Backfilled
// points from a coverage gap legitimately arrive out of chronological order,
// so the claim the chain supports is precisely: "these records were received
// in this order and have not been modified since."
package integrity

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// GenesisHash starts every device chain. A fixed, non-secret value, so an
// independent verifier can reproduce the chain from the first record.
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

// AuthMethod records how a device proved its identity for one point.
type AuthMethod string

const (
	// AuthHMAC is an HMAC-SHA256 signature over the canonical payload.
	AuthHMAC AuthMethod = "hmac"

	// AuthSecret is the legacy plaintext shared secret. Accepted so existing
	// firmware keeps working, but a certificate reports it separately: the
	// secret travels in the clear, so anyone who can read the broker could
	// have produced the point.
	AuthSecret AuthMethod = "secret"
)

// Record is the subset of a location fix that the chain commits to.
//
// Every field here is covered by the hash. Anything not listed can be changed
// without breaking verification, so only add fields that must be tamper-proof.
type Record struct {
	DeviceSerial string
	RecordedAt   time.Time
	Lat          float64
	Lng          float64
	Speed        int
	Satellites   int
	CSQ          int
	Battery      float64
	Ignition     *bool
	Heading      *float64
	IsBackfill   bool
	AuthMethod   AuthMethod
}

// canonical renders a record as a byte string that is identical on every
// machine and in every language.
//
// Determinism is the whole point: a verifier written in Python must produce
// byte-for-byte the same input. Hence explicit formatting rather than JSON
// (key order and float rendering vary between encoders), fixed decimal places,
// and UTC timestamps in RFC3339 with no sub-second component.
func (r Record) canonical() string {
	var b strings.Builder

	write := func(parts ...string) {
		for _, p := range parts {
			b.WriteString(p)
			b.WriteByte('|')
		}
	}

	ignition := "null"
	if r.Ignition != nil {
		ignition = strconv.FormatBool(*r.Ignition)
	}

	heading := "null"
	if r.Heading != nil {
		heading = strconv.FormatFloat(*r.Heading, 'f', 2, 64)
	}

	write(
		"v1",
		r.DeviceSerial,
		r.RecordedAt.UTC().Format(time.RFC3339),
		strconv.FormatFloat(r.Lat, 'f', 6, 64),
		strconv.FormatFloat(r.Lng, 'f', 6, 64),
		strconv.Itoa(r.Speed),
		strconv.Itoa(r.Satellites),
		strconv.Itoa(r.CSQ),
		strconv.FormatFloat(r.Battery, 'f', 2, 64),
		ignition,
		heading,
		strconv.FormatBool(r.IsBackfill),
		string(r.AuthMethod),
	)

	return b.String()
}

// HashRecord returns the chain hash for a record given the hash before it.
func HashRecord(r Record, prevHash string) string {
	sum := sha256.Sum256([]byte(prevHash + "|" + r.canonical()))
	return hex.EncodeToString(sum[:])
}

// SignPayload produces the HMAC a device sends alongside a location fix.
//
// The signed string covers the values that matter for authenticity: identity,
// time and position. It deliberately does NOT include the secret itself, which
// is the HMAC key and must never appear in the message.
func SignPayload(secret, device string, timestamp int64, lat, lng float64) string {
	msg := fmt.Sprintf("%s|%d|%.6f|%.6f", device, timestamp, lat, lng)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))

	return hex.EncodeToString(mac.Sum(nil))
}

// SignMessage is the general-purpose form of SignPayload, for the control
// channel: commands the server sends down, and acknowledgements the device
// sends back.
//
// Both directions are signed with the same shared secret. Downlink signing is
// the important half: without it, anyone who can write to the broker could
// publish an engine-cut command to any device on it.
func SignMessage(secret string, parts ...string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strings.Join(parts, "|")))

	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyMessage checks a SignMessage signature in constant time.
func VerifyMessage(secret, signature string, parts ...string) bool {
	got, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return false
	}
	want, _ := hex.DecodeString(SignMessage(secret, parts...))

	return hmac.Equal(got, want)
}

// VerifyPayload checks a device signature in constant time.
func VerifyPayload(secret, device string, timestamp int64, lat, lng float64, signature string) bool {
	expected := SignPayload(secret, device, timestamp, lat, lng)

	// Compare decoded bytes: hex.EncodeToString always emits lowercase, but a
	// client may send uppercase, and a plain string compare would reject a
	// perfectly valid signature.
	got, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return false
	}
	want, _ := hex.DecodeString(expected)

	return hmac.Equal(got, want)
}

// VerificationResult reports the outcome of replaying a chain.
type VerificationResult struct {
	Valid         bool `json:"valid"`
	RecordCount   int  `json:"record_count"`
	HMACCount     int  `json:"hmac_count"`
	LegacyCount   int  `json:"legacy_count"`
	BackfillCount int  `json:"backfill_count"`

	// UnprotectedCount is the number of leading records stored before the
	// chain existed. They are reported, never silently counted as verified:
	// claiming rows are tamper-proof when they were never hashed would be the
	// one thing this whole feature must not do.
	UnprotectedCount int `json:"unprotected_count"`

	HeadHash string `json:"head_hash"`

	// FirstBrokenID is the id of the earliest record whose hash does not
	// match, i.e. where tampering begins. Zero when the chain is intact.
	FirstBrokenID int64 `json:"first_broken_id,omitempty"`

	Detail    string    `json:"detail,omitempty"`
	CheckedAt time.Time `json:"checked_at"`
}

// StoredRecord is a chain row read back from the database.
type StoredRecord struct {
	ID         int64
	Record     Record
	PrevHash   string
	RecordHash string
}

// VerifyChain recomputes every hash in ingest order and reports where, if
// anywhere, the stored chain stops matching.
//
// Pass records in ascending id order. startHash is GenesisHash for a full
// verification, or the hash preceding the first record for a partial range.
func VerifyChain(records []StoredRecord, startHash string) VerificationResult {
	result := VerificationResult{
		Valid:       true,
		RecordCount: len(records),
		HeadHash:    startHash,
		CheckedAt:   time.Now().UTC(),
	}

	prev := startHash
	started := false

	for _, sr := range records {
		if sr.Record.AuthMethod == AuthHMAC {
			result.HMACCount++
		} else {
			result.LegacyCount++
		}
		if sr.Record.IsBackfill {
			result.BackfillCount++
		}

		if sr.RecordHash == "" {
			if !started {
				// Predates the chain. Excluded from the verified set and
				// counted separately, rather than failing the whole device
				// forever because it has history from before the feature.
				result.UnprotectedCount++
				continue
			}

			// An unhashed row *after* hashing began means a hash was cleared.
			result.Valid = false
			result.FirstBrokenID = sr.ID
			result.Detail = fmt.Sprintf(
				"record %d has no hash although the chain had already started - a hash was removed",
				sr.ID)
			return result
		}

		// The first hashed record anchors the verified range.
		if !started {
			started = true
			prev = sr.PrevHash
			result.HeadHash = prev
		}

		if sr.PrevHash != prev {
			result.Valid = false
			result.FirstBrokenID = sr.ID
			result.Detail = fmt.Sprintf(
				"record %d links to %s but the preceding record hashes to %s - a record was inserted, removed or reordered",
				sr.ID, short(sr.PrevHash), short(prev))
			return result
		}

		expected := HashRecord(sr.Record, prev)
		if expected != sr.RecordHash {
			result.Valid = false
			result.FirstBrokenID = sr.ID
			result.Detail = fmt.Sprintf(
				"record %d hashes to %s but %s is stored - its contents were modified after storage",
				sr.ID, short(expected), short(sr.RecordHash))
			return result
		}

		prev = sr.RecordHash
	}

	result.HeadHash = prev

	switch {
	case result.UnprotectedCount == len(records):
		result.Detail = fmt.Sprintf(
			"all %d records predate the hash chain and are not covered by it",
			result.UnprotectedCount)
	case result.UnprotectedCount > 0:
		result.Detail = fmt.Sprintf(
			"the %d chained records all hash correctly; %d earlier records predate the chain and are excluded",
			len(records)-result.UnprotectedCount, result.UnprotectedCount)
	default:
		result.Detail = "every record hashes correctly and links to the one before it"
	}

	return result
}

func short(h string) string {
	if len(h) <= 12 {
		return h
	}
	return h[:12] + "..."
}
