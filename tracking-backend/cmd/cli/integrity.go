package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"tracking-backend/internal/integrity"
)

/*
Integrity commands.

cert-verify is the important one: it validates a certificate using only the
document and a public key — no database, no server. That is what makes a
certificate meaningful to someone outside the operator. They can run this, or
reimplement it in twenty lines, and reach the same answer.
*/

// cmdCertKeygen mints the server signing identity.
func cmdCertKeygen(_ *sql.DB, args []string) error {
	fs := flagSet("cert-keygen")
	fs.Parse(args)

	key, err := integrity.GenerateKeyPair()
	if err != nil {
		return err
	}

	fmt.Println("Ed25519 signing key generated.")
	fmt.Println()
	fmt.Println("Add this to the server environment (keep it secret):")
	fmt.Printf("  CERT_SIGNING_KEY=%s\n", integrity.EncodePrivateKey(key))
	fmt.Println()
	fmt.Println("Publish this so anyone can verify your certificates:")
	fmt.Printf("  public key: %s\n", key.PublicKeyHex())
	fmt.Println()
	fmt.Println("Rotating this key invalidates verification of every certificate")
	fmt.Println("already issued, so publish the old public key alongside the new one.")

	return nil
}

// readChain loads every chain row for a device in ingest order.
func readChain(db *sql.DB, serial string, verbose bool) ([]integrity.StoredRecord, error) {
	rows, err := db.Query(`
        SELECT id, recorded_at, lat, lng, speed, satellites, csq, battery,
               ignition, heading, is_backfill,
               COALESCE(auth_method, 'secret'),
               COALESCE(prev_hash, ''), COALESCE(record_hash, '')
        FROM location_history
        WHERE device_serial = $1
        ORDER BY id ASC`, serial)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []integrity.StoredRecord

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

		if verbose {
			fmt.Printf("  #%d  %s  %.6f,%.6f  %s\n",
				sr.ID, sr.Record.RecordedAt.Format(time.RFC3339),
				sr.Record.Lat, sr.Record.Lng, method)
		}

		records = append(records, sr)
	}

	return records, rows.Err()
}

// cmdVerifyChain replays a device chain straight from the database.
func cmdVerifyChain(db *sql.DB, args []string) error {
	fs := flagSet("verify-chain")
	serial := fs.String("serial", "", "Device serial (required)")
	verbose := fs.Bool("v", false, "Print each record as it is checked")
	fs.Parse(args)

	if err := requireFlag(*serial, "serial"); err != nil {
		return err
	}

	records, err := readChain(db, *serial, *verbose)
	if err != nil {
		return err
	}

	result := integrity.VerifyChain(records, integrity.GenesisHash)

	fmt.Printf("\nDevice:    %s\n", *serial)
	fmt.Printf("Records:   %d  (%d HMAC-signed, %d legacy secret, %d backfilled)\n",
		result.RecordCount, result.HMACCount, result.LegacyCount, result.BackfillCount)
	if result.UnprotectedCount > 0 {
		fmt.Printf("Uncovered: %d records predate the hash chain and are not protected by it\n",
			result.UnprotectedCount)
	}

	fmt.Printf("Head hash: %s\n", shortHash(result.HeadHash))

	if !result.Valid {
		fmt.Println()
		fmt.Printf("FAILED at record %d\n  %s\n", result.FirstBrokenID, result.Detail)
		os.Exit(1)
	}

	// Only meaningful once the replay itself passed. Checking it first
	// reported "records were removed from the end" for a device whose
	// real problem was unhashed legacy rows at the start.
	// Replaying alone cannot detect rows deleted from the *end* of the chain:
	// everything remaining still links correctly. The recorded head catches it.
	var storedHead string
	var storedCount int64

	err = db.QueryRow(
		"SELECT head_hash, record_count FROM device_chain WHERE device_serial = $1",
		*serial,
	).Scan(&storedHead, &storedCount)

	switch {
	case err == sql.ErrNoRows:
		fmt.Println("Stored:    no chain head recorded for this device yet")
	case err != nil:
		return err
	default:
		if storedHead != result.HeadHash {
			fmt.Printf("Stored:    MISMATCH - head is %s over %d records\n",
				shortHash(storedHead), storedCount)
			fmt.Println()
			fmt.Println("FAILED: records were removed from the end of the chain.")
			os.Exit(1)
		}
		fmt.Printf("Stored:    matches (%d records)\n", storedCount)
	}

	fmt.Println()
	fmt.Printf("OK: %s\n", result.Detail)
	return nil
}

// cmdCertVerify validates a certificate file offline.
func cmdCertVerify(_ *sql.DB, args []string) error {
	fs := flagSet("cert-verify")
	path := fs.String("file", "", "Path to the certificate JSON (required)")
	pubkey := fs.String("public-key", "", "Expected public key in hex (defaults to the one inside the document)")
	fs.Parse(args)

	if err := requireFlag(*path, "file"); err != nil {
		return err
	}

	raw, err := os.ReadFile(*path)
	if err != nil {
		return fmt.Errorf("reading certificate: %w", err)
	}

	var cert integrity.Certificate
	if err := json.Unmarshal(raw, &cert); err != nil {
		return fmt.Errorf("certificate is not valid JSON: %w", err)
	}

	key := *pubkey
	if key == "" {
		key = cert.PublicKey
		fmt.Println("NOTE: verifying against the key embedded in the document.")
		fmt.Println("      That proves it is internally consistent, not that it came")
		fmt.Println("      from a server you trust. Pass -public-key to check that.")
		fmt.Println()
	}

	ok, err := integrity.VerifyCertificate(cert, key)
	if err != nil {
		return err
	}

	b := cert.Body

	fmt.Printf("Device:    %s\n", b.DeviceSerial)
	if b.Owner != "" {
		fmt.Printf("Owner:     %s\n", b.Owner)
	}
	fmt.Printf("Period:    %s  to  %s\n",
		b.From.Format(time.RFC3339), b.To.Format(time.RFC3339))
	fmt.Printf("Issued:    %s by %s\n", b.IssuedAt.Format(time.RFC3339), b.Issuer)
	fmt.Printf("Points:    %d  (%d HMAC-signed, %d legacy secret, %d backfilled)\n",
		b.PointCount, b.HMACCount, b.LegacyCount, b.BackfillCount)
	fmt.Printf("Distance:  %.2f km\n", b.DistanceKm)
	fmt.Printf("Chain:     %s -> %s\n", shortHash(b.ChainStart), shortHash(b.ChainEnd))
	fmt.Println()

	if !ok {
		fmt.Println("SIGNATURE INVALID - this document was altered after it was issued.")
		os.Exit(1)
	}
	fmt.Println("Signature VALID - the document is exactly as issued.")

	if !b.ChainVerified {
		fmt.Println()
		fmt.Println("WARNING: the issuer recorded that the underlying hash chain did")
		fmt.Printf("         NOT verify at issue time: %s\n", b.ChainDetail)
		os.Exit(1)
	}
	fmt.Println("Hash chain was intact when the certificate was issued.")

	if b.LegacyCount > 0 {
		fmt.Println()
		fmt.Printf("NOTE: %d of %d points used the legacy plaintext secret rather than\n",
			b.LegacyCount, b.PointCount)
		fmt.Println("      an HMAC signature. Those points are weaker evidence: the secret")
		fmt.Println("      travels in clear text, so anyone able to read the broker could")
		fmt.Println("      have produced them.")
	}

	return nil
}

func shortHash(h string) string {
	if len(h) <= 16 {
		return h
	}
	return h[:16] + "..."
}
