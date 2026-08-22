package integrity

import (
	"strings"
	"testing"
	"time"
)

var base = time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)

func rec(min int, lat, lng float64) Record {
	return Record{
		DeviceSerial: "TRACKER-001",
		RecordedAt:   base.Add(time.Duration(min) * time.Minute),
		Lat:          lat,
		Lng:          lng,
		Speed:        45,
		Satellites:   9,
		CSQ:          22,
		Battery:      12.4,
		AuthMethod:   AuthHMAC,
	}
}

// build links records into a valid chain, the way the subscriber does.
func build(records []Record) []StoredRecord {
	out := make([]StoredRecord, 0, len(records))
	prev := GenesisHash

	for i, r := range records {
		h := HashRecord(r, prev)
		out = append(out, StoredRecord{
			ID:         int64(i + 1),
			Record:     r,
			PrevHash:   prev,
			RecordHash: h,
		})
		prev = h
	}

	return out
}

func TestHashIsDeterministic(t *testing.T) {
	r := rec(0, 35.6892, 51.3890)

	if HashRecord(r, GenesisHash) != HashRecord(r, GenesisHash) {
		t.Fatal("same record and prev hash produced different hashes")
	}
}

func TestHashDependsOnEveryCommittedField(t *testing.T) {
	baseRec := rec(0, 35.6892, 51.3890)
	original := HashRecord(baseRec, GenesisHash)

	ignitionOn := true
	heading := 91.5

	mutations := map[string]func(*Record){
		"lat":         func(r *Record) { r.Lat += 0.000001 },
		"lng":         func(r *Record) { r.Lng += 0.000001 },
		"speed":       func(r *Record) { r.Speed++ },
		"satellites":  func(r *Record) { r.Satellites++ },
		"csq":         func(r *Record) { r.CSQ++ },
		"battery":     func(r *Record) { r.Battery += 0.01 },
		"recorded_at": func(r *Record) { r.RecordedAt = r.RecordedAt.Add(time.Second) },
		"device":      func(r *Record) { r.DeviceSerial = "OTHER" },
		"ignition":    func(r *Record) { r.Ignition = &ignitionOn },
		"heading":     func(r *Record) { r.Heading = &heading },
		"backfill":    func(r *Record) { r.IsBackfill = true },
		"auth":        func(r *Record) { r.AuthMethod = AuthSecret },
	}

	for name, mutate := range mutations {
		m := baseRec
		mutate(&m)

		if HashRecord(m, GenesisHash) == original {
			t.Errorf("changing %s did not change the hash - it is not covered by the chain", name)
		}
	}
}

func TestHashDependsOnPrevious(t *testing.T) {
	r := rec(0, 35.6892, 51.3890)

	if HashRecord(r, GenesisHash) == HashRecord(r, "aaaa") {
		t.Fatal("hash ignores the previous hash, so records are not chained")
	}
}

func TestVerifyIntactChain(t *testing.T) {
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
		rec(2, 35.6910, 51.3910),
	})

	res := VerifyChain(chain, GenesisHash)

	if !res.Valid {
		t.Fatalf("intact chain reported invalid: %s", res.Detail)
	}
	if res.RecordCount != 3 || res.HMACCount != 3 {
		t.Errorf("counts = %d records / %d hmac, want 3/3", res.RecordCount, res.HMACCount)
	}
	if res.HeadHash != chain[2].RecordHash {
		t.Error("head hash does not match the last record")
	}
}

func TestVerifyDetectsEditedRecord(t *testing.T) {
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
		rec(2, 35.6910, 51.3910),
	})

	// Someone edits the middle position in the database but cannot recompute
	// the hashes, which is exactly the scenario the chain exists to catch.
	chain[1].Record.Lat = 40.0

	res := VerifyChain(chain, GenesisHash)

	if res.Valid {
		t.Fatal("edited record passed verification")
	}
	if res.FirstBrokenID != 2 {
		t.Errorf("FirstBrokenID = %d, want 2", res.FirstBrokenID)
	}
}

func TestVerifyDetectsDeletedRecord(t *testing.T) {
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
		rec(2, 35.6910, 51.3910),
	})

	// Drop the middle record: the third no longer links to the first.
	tampered := []StoredRecord{chain[0], chain[2]}

	res := VerifyChain(tampered, GenesisHash)

	if res.Valid {
		t.Fatal("chain with a deleted record passed verification")
	}
	if res.FirstBrokenID != 3 {
		t.Errorf("FirstBrokenID = %d, want 3", res.FirstBrokenID)
	}
}

func TestVerifyDetectsReordering(t *testing.T) {
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
		rec(2, 35.6910, 51.3910),
	})

	chain[1], chain[2] = chain[2], chain[1]

	if VerifyChain(chain, GenesisHash).Valid {
		t.Fatal("reordered chain passed verification")
	}
}

func TestVerifyExcludesLegacyRecordsFromTheStart(t *testing.T) {
	// Rows that predate the feature have no hash. They must be reported as
	// unprotected, not silently counted as verified - and they must not make
	// the device permanently unverifiable either.
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
	})

	legacy := StoredRecord{ID: 0, Record: rec(-1, 35.68, 51.38)}
	withLegacy := append([]StoredRecord{legacy}, chain...)

	res := VerifyChain(withLegacy, GenesisHash)

	if !res.Valid {
		t.Fatalf("leading legacy row broke verification: %s", res.Detail)
	}
	if res.UnprotectedCount != 1 {
		t.Errorf("UnprotectedCount = %d, want 1", res.UnprotectedCount)
	}
	if res.HeadHash != chain[len(chain)-1].RecordHash {
		t.Error("head hash should track the last chained record")
	}
}

func TestVerifyRejectsHashRemovedMidChain(t *testing.T) {
	// Clearing a hash after the chain has started is tampering, not legacy
	// data, and must fail.
	chain := build([]Record{
		rec(0, 35.6892, 51.3890),
		rec(1, 35.6900, 51.3900),
		rec(2, 35.6910, 51.3910),
	})
	chain[1].RecordHash = ""

	res := VerifyChain(chain, GenesisHash)

	if res.Valid {
		t.Fatal("a hash cleared mid-chain passed verification")
	}
	if res.FirstBrokenID != 2 {
		t.Errorf("FirstBrokenID = %d, want 2", res.FirstBrokenID)
	}
}

func TestVerifyAllLegacyRecords(t *testing.T) {
	// A device with only pre-chain history: valid, but explicitly uncovered.
	records := []StoredRecord{
		{ID: 1, Record: rec(0, 35.68, 51.38)},
		{ID: 2, Record: rec(1, 35.69, 51.39)},
	}

	res := VerifyChain(records, GenesisHash)

	if !res.Valid {
		t.Fatalf("all-legacy device reported invalid: %s", res.Detail)
	}
	if res.UnprotectedCount != 2 {
		t.Errorf("UnprotectedCount = %d, want 2", res.UnprotectedCount)
	}
	if !strings.Contains(res.Detail, "not covered") {
		t.Errorf("detail should say the records are uncovered, got: %s", res.Detail)
	}
}

func TestVerifyEmptyChain(t *testing.T) {
	res := VerifyChain(nil, GenesisHash)

	if !res.Valid || res.RecordCount != 0 {
		t.Errorf("empty chain = %+v, want valid with 0 records", res)
	}
	if res.HeadHash != GenesisHash {
		t.Error("empty chain should leave the head at genesis")
	}
}

func TestVerifyCountsBackfillAndLegacy(t *testing.T) {
	a := rec(0, 35.6892, 51.3890)
	b := rec(1, 35.6900, 51.3900)
	b.IsBackfill = true
	b.AuthMethod = AuthSecret

	res := VerifyChain(build([]Record{a, b}), GenesisHash)

	if res.BackfillCount != 1 {
		t.Errorf("BackfillCount = %d, want 1", res.BackfillCount)
	}
	if res.LegacyCount != 1 || res.HMACCount != 1 {
		t.Errorf("legacy/hmac = %d/%d, want 1/1", res.LegacyCount, res.HMACCount)
	}
}

/* ------------------------------------------------------------ device HMAC */

func TestSignAndVerifyPayload(t *testing.T) {
	const secret = "357951"

	sig := SignPayload(secret, "DEVICEADMIN", 1772000000, 35.689200, 51.389000)

	if !VerifyPayload(secret, "DEVICEADMIN", 1772000000, 35.689200, 51.389000, sig) {
		t.Fatal("a signature produced by SignPayload failed VerifyPayload")
	}
}

func TestVerifyPayloadRejectsTampering(t *testing.T) {
	const secret = "357951"
	sig := SignPayload(secret, "DEVICEADMIN", 1772000000, 35.689200, 51.389000)

	cases := []struct {
		name       string
		device     string
		ts         int64
		lat, lng   float64
		secretUsed string
	}{
		{"wrong secret", "DEVICEADMIN", 1772000000, 35.689200, 51.389000, "wrong"},
		{"moved position", "DEVICEADMIN", 1772000000, 40.000000, 51.389000, secret},
		{"changed time", "DEVICEADMIN", 1772000099, 35.689200, 51.389000, secret},
		{"other device", "OTHER", 1772000000, 35.689200, 51.389000, secret},
	}

	for _, c := range cases {
		if VerifyPayload(c.secretUsed, c.device, c.ts, c.lat, c.lng, sig) {
			t.Errorf("%s: tampered payload accepted", c.name)
		}
	}
}

func TestVerifyPayloadAcceptsUppercaseHex(t *testing.T) {
	const secret = "357951"
	sig := SignPayload(secret, "DEVICEADMIN", 1772000000, 35.689200, 51.389000)

	upper := ""
	for _, r := range sig {
		if r >= 'a' && r <= 'f' {
			upper += string(r - 32)
		} else {
			upper += string(r)
		}
	}

	if !VerifyPayload(secret, "DEVICEADMIN", 1772000000, 35.689200, 51.389000, upper) {
		t.Fatal("uppercase hex signature rejected; firmware casing must not matter")
	}
}

func TestVerifyPayloadRejectsGarbage(t *testing.T) {
	for _, bad := range []string{"", "zzzz", "not-hex-at-all"} {
		if VerifyPayload("s", "D", 1, 1, 1, bad) {
			t.Errorf("accepted malformed signature %q", bad)
		}
	}
}

/* ------------------------------------------------------------ certificate */

func TestCertificateRoundTrip(t *testing.T) {
	key, err := GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	body := CertificateBody{
		DeviceSerial: "TRACKER-001",
		From:         base,
		To:           base.Add(time.Hour),
		IssuedAt:     base.Add(2 * time.Hour),
		Issuer:       "test",
		PointCount:   2,
		ChainStart:   GenesisHash,
		ChainEnd:     "abc123",
		Points: []CertificatePoint{
			{RecordedAt: base, Lat: 35.6892, Lng: 51.3890, Auth: "hmac", Hash: "h1"},
		},
	}

	cert, err := Sign(body, key)
	if err != nil {
		t.Fatal(err)
	}

	ok, err := VerifyCertificate(cert, key.PublicKeyHex())
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("a freshly signed certificate failed verification")
	}
}

func TestCertificateDetectsTampering(t *testing.T) {
	key, _ := GenerateKeyPair()

	cert, err := Sign(CertificateBody{
		DeviceSerial: "TRACKER-001",
		PointCount:   2,
		DistanceKm:   12.5,
		Points: []CertificatePoint{
			{RecordedAt: base, Lat: 35.6892, Lng: 51.3890, Auth: "hmac", Hash: "h1"},
		},
	}, key)
	if err != nil {
		t.Fatal(err)
	}

	// Someone edits the distance to inflate a mileage claim.
	cert.Body.DistanceKm = 900

	ok, err := VerifyCertificate(cert, key.PublicKeyHex())
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("edited certificate still verified")
	}
}

func TestCertificateRejectsWrongKey(t *testing.T) {
	signer, _ := GenerateKeyPair()
	other, _ := GenerateKeyPair()

	cert, _ := Sign(CertificateBody{DeviceSerial: "X"}, signer)

	ok, err := VerifyCertificate(cert, other.PublicKeyHex())
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("certificate verified against an unrelated public key")
	}
}

func TestPrivateKeyEncodingRoundTrip(t *testing.T) {
	key, _ := GenerateKeyPair()

	parsed, err := ParsePrivateKey(EncodePrivateKey(key))
	if err != nil {
		t.Fatal(err)
	}

	if parsed.PublicKeyHex() != key.PublicKeyHex() {
		t.Fatal("round-tripping the private key produced a different public key")
	}
}

func TestParsePrivateKeyRejectsBadInput(t *testing.T) {
	for _, bad := range []string{"", "!!!not base64!!!", "c2hvcnQ="} {
		if _, err := ParsePrivateKey(bad); err == nil {
			t.Errorf("accepted invalid signing key %q", bad)
		}
	}
}
