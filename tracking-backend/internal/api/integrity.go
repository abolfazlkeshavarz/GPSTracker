package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"tracking-backend/internal/config"
	"tracking-backend/internal/db"
	"tracking-backend/internal/integrity"
	"tracking-backend/internal/models"
	"tracking-backend/internal/services"

	"github.com/gin-gonic/gin"
)

/*
Endpoints backing the tamper-evident history feature.

  GET /api/devices/:serial/verify       replay the hash chain for a range
  GET /api/devices/:serial/certificate  issue a signed, exportable document
  GET /api/certificate-key              the public key, for third parties

The public key endpoint is deliberately unauthenticated: the whole point of an
asymmetric signature is that someone outside the system — an insurer, a court
expert, a customer's own auditor — can verify a document without an account.
*/

// signingKey resolves the configured Ed25519 key, if any.
func signingKey() (integrity.KeyPair, error) {
	if config.AppConfig == nil || config.AppConfig.CertSigningKey == "" {
		return integrity.KeyPair{}, fmt.Errorf("certificate signing is not configured")
	}
	return integrity.ParsePrivateKey(config.AppConfig.CertSigningKey)
}

// chainRow is one location row with everything the chain commits to.
const chainColumns = `
    id, recorded_at, lat, lng, speed, satellites, csq, battery,
    ignition, heading, is_backfill,
    COALESCE(auth_method, 'secret'), COALESCE(prev_hash, ''), COALESCE(record_hash, '')`

func scanChainRows(rows *sql.Rows, serial string) ([]integrity.StoredRecord, error) {
	var out []integrity.StoredRecord

	for rows.Next() {
		var (
			sr       integrity.StoredRecord
			battery  sql.NullFloat64
			ignition sql.NullBool
			heading  sql.NullFloat64
			method   string
		)

		if err := rows.Scan(
			&sr.ID, &sr.Record.RecordedAt, &sr.Record.Lat, &sr.Record.Lng,
			&sr.Record.Speed, &sr.Record.Satellites, &sr.Record.CSQ, &battery,
			&ignition, &heading, &sr.Record.IsBackfill,
			&method, &sr.PrevHash, &sr.RecordHash,
		); err != nil {
			return nil, err
		}

		sr.Record.DeviceSerial = serial
		sr.Record.AuthMethod = integrity.AuthMethod(method)

		if battery.Valid {
			sr.Record.Battery = battery.Float64
		}
		if ignition.Valid {
			v := ignition.Bool
			sr.Record.Ignition = &v
		}
		if heading.Valid {
			v := heading.Float64
			sr.Record.Heading = &v
		}

		out = append(out, sr)
	}

	return out, rows.Err()
}

// loadChainRange reads the chain rows for a time window, in ingest order.
//
// Ordering by id, not recorded_at, is essential: the chain is built in arrival
// order, and backfilled points arrive out of chronological sequence.
func loadChainRange(serial string, from, to time.Time) ([]integrity.StoredRecord, error) {
	rows, err := db.DB.Query(`
        SELECT `+chainColumns+`
        FROM location_history
        WHERE device_serial = $1 AND recorded_at >= $2 AND recorded_at <= $3
        ORDER BY id ASC
        LIMIT $4`,
		serial, from, to, maxTrackPoints+1,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanChainRows(rows, serial)
}

// GetDeviceChainVerification replays the hash chain and reports whether the
// stored history has been altered.
func GetDeviceChainVerification(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	to, err := parseTimeParam(c.Query("to"), time.Now(), true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' date: " + err.Error()})
		return
	}

	from, err := parseTimeParam(c.Query("from"), to.Add(-24*time.Hour), false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' date: " + err.Error()})
		return
	}

	records, err := loadChainRange(serial, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// A partial range does not start at genesis, so seed the verification with
	// the hash the first record claims to follow. That still detects any edit
	// or reordering *inside* the range; proving the range itself is correctly
	// anchored needs a full verification from the first record.
	start := integrity.GenesisHash
	anchored := true

	if len(records) > 0 && records[0].PrevHash != integrity.GenesisHash {
		start = records[0].PrevHash
		anchored = false
	}

	result := integrity.VerifyChain(records, start)

	c.JSON(http.StatusOK, gin.H{
		"device":            serial,
		"from":              from,
		"to":                to,
		"verification":      result,
		"anchored_to_start": anchored,
		"note": "The chain is ordered by arrival, not by recorded time: backfilled " +
			"points legitimately arrive out of order.",
	})
}

// GetDeviceCertificate issues a signed, exportable record of a journey.
func GetDeviceCertificate(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	key, err := signingKey()
	if err != nil {
		// 501, not 500: the server works, this feature is simply not set up.
		c.JSON(http.StatusNotImplemented, gin.H{
			"error": "Certificate signing is not configured on this server. " +
				"Generate a key with 'cli cert-keygen' and set CERT_SIGNING_KEY.",
		})
		return
	}

	to, err := parseTimeParam(c.Query("to"), time.Now(), true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' date: " + err.Error()})
		return
	}

	from, err := parseTimeParam(c.Query("from"), to.Add(-24*time.Hour), false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' date: " + err.Error()})
		return
	}

	if !from.Before(to) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "'from' must be earlier than 'to'"})
		return
	}

	records, err := loadChainRange(serial, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No records in that range to certify"})
		return
	}

	start := integrity.GenesisHash
	if records[0].PrevHash != integrity.GenesisHash {
		start = records[0].PrevHash
	}

	verification := integrity.VerifyChain(records, start)

	// Reuse the same distance and stop maths the history view shows, so a
	// certificate never disagrees with the UI it was exported from.
	points := make([]models.TrackPoint, 0, len(records))
	certPoints := make([]integrity.CertificatePoint, 0, len(records))

	for _, r := range records {
		points = append(points, models.TrackPoint{
			Lat:        r.Record.Lat,
			Lng:        r.Record.Lng,
			Speed:      r.Record.Speed,
			Satellites: r.Record.Satellites,
			CSQ:        r.Record.CSQ,
			Battery:    r.Record.Battery,
			RecordedAt: r.Record.RecordedAt,
		})

		certPoints = append(certPoints, integrity.CertificatePoint{
			RecordedAt: r.Record.RecordedAt.UTC(),
			Lat:        r.Record.Lat,
			Lng:        r.Record.Lng,
			Speed:      r.Record.Speed,
			Backfilled: r.Record.IsBackfill,
			Auth:       string(r.Record.AuthMethod),
			Hash:       r.RecordHash,
		})
	}

	_, summary := services.BuildTrack(points, services.DefaultTrackOptions())

	var owner string
	_ = db.DB.QueryRow(`
        SELECT COALESCE(u.phone, '')
        FROM devices d LEFT JOIN users u ON u.id = d.user_id
        WHERE d.serial = $1`, serial).Scan(&owner)

	issuer := "gpstracker"
	if config.AppConfig != nil && config.AppConfig.AppDomain != "" {
		issuer = config.AppConfig.AppDomain
	}

	cert, err := integrity.Sign(integrity.CertificateBody{
		DeviceSerial:   serial,
		Owner:          owner,
		From:           from.UTC(),
		To:             to.UTC(),
		IssuedAt:       time.Now().UTC(),
		Issuer:         issuer,
		PointCount:     verification.RecordCount,
		HMACCount:      verification.HMACCount,
		LegacyCount:    verification.LegacyCount,
		BackfillCount:  verification.BackfillCount,
		DistanceKm:     summary.DistanceKm,
		MovingSeconds:  summary.MovingSeconds,
		StoppedSeconds: summary.StoppedSeconds,
		ChainStart:     start,
		ChainEnd:       verification.HeadHash,
		ChainVerified:  verification.Valid,
		ChainDetail:    verification.Detail,
		Points:         certPoints,
	}, key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not sign certificate"})
		return
	}

	// Offered as a download: a certificate is a document to keep, not a page
	// to read.
	if c.Query("download") != "" {
		filename := fmt.Sprintf("certificate-%s-%s.json", serial, from.Format("20060102"))
		c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	}

	c.IndentedJSON(http.StatusOK, cert)
}

// GetCertificatePublicKey publishes the verification key.
//
// Unauthenticated by design: a third party must be able to check a certificate
// without holding an account on this system.
func GetCertificatePublicKey(c *gin.Context) {
	key, err := signingKey()
	if err != nil {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "Certificate signing is not configured"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"algorithm":  "Ed25519",
		"public_key": key.PublicKeyHex(),
		"usage": "Verify the 'signature' field of a trip certificate against the " +
			"JSON encoding of its 'certificate' object.",
	})
}
