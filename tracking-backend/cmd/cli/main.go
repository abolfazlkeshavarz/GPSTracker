// Command cli is the administrative tool for GPSTracker.
//
// It replaces the old create_admin.go, which had the database DSN and the
// admin password hardcoded and could only ever do one thing.
//
// Connection settings come from the environment / .env, exactly like the
// server, so it always talks to the same database the server does.
//
// Usage:
//
//	go run ./cmd/cli <command> [flags]
//
// Run with no arguments for the command list, or see `make help`.
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"tracking-backend/internal/config"
	"tracking-backend/internal/utils"

	_ "github.com/lib/pq"
)

type command struct {
	name    string
	summary string
	run     func(db *sql.DB, args []string) error
	// needsDB is false for helpers like `hash` that do not touch Postgres.
	needsDB bool
}

var commands []command

func init() {
	commands = []command{
		{"create-admin", "Create or update an admin user", cmdCreateAdmin, true},
		{"create-user", "Create or update a user", cmdCreateUser, true},
		{"create-device", "Register a device, optionally assigning an owner", cmdCreateDevice, true},
		{"assign-device", "Assign an existing device to a user and activate it", cmdAssignDevice, true},
		{"deactivate-device", "Unassign a device and mark it inactive", cmdDeactivateDevice, true},
		{"delete-device", "Delete a device and its location history", cmdDeleteDevice, true},
		{"reset-password", "Set a new password for an existing user", cmdResetPassword, true},
		{"list-users", "List users", cmdListUsers, true},
		{"list-devices", "List devices and their owners", cmdListDevices, true},
		{"stats", "Show row counts across the database", cmdStats, true},
		{"hash", "Print a bcrypt hash for a password", cmdHash, false},
		{"verify-chain", "Replay a device hash chain and report tampering", cmdVerifyChain, true},
		{"cert-keygen", "Generate the Ed25519 certificate signing key", cmdCertKeygen, false},
		{"cert-verify", "Verify a trip certificate file offline", cmdCertVerify, false},
	}
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	name := os.Args[1]

	for _, c := range commands {
		if c.name != name {
			continue
		}

		var db *sql.DB

		if c.needsDB {
			var err error
			db, err = openDB()
			if err != nil {
				fatal(err)
			}
			defer db.Close()
		}

		if err := c.run(db, os.Args[2:]); err != nil {
			fatal(err)
		}
		return
	}

	fmt.Fprintf(os.Stderr, "unknown command %q\n\n", name)
	usage()
	os.Exit(2)
}

func usage() {
	fmt.Fprintln(os.Stderr, "GPSTracker admin CLI")
	fmt.Fprintln(os.Stderr, "\nUsage: cli <command> [flags]\n\nCommands:")

	w := tabwriter.NewWriter(os.Stderr, 0, 0, 3, ' ', 0)
	for _, c := range commands {
		fmt.Fprintf(w, "  %s\t%s\n", c.name, c.summary)
	}
	w.Flush()

	fmt.Fprintln(os.Stderr, "\nRun 'cli <command> -h' for the flags of a command.")
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func openDB() (*sql.DB, error) {
	cfg := config.Load()

	db, err := sql.Open("postgres", cfg.PostgresDSN())
	if err != nil {
		return nil, fmt.Errorf("connecting to postgres: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot reach postgres at %s:%s/%s: %w",
			cfg.DBHost, cfg.DBPort, cfg.DBName, err)
	}

	return db, nil
}

// flagSet builds a FlagSet that reports errors through the normal path.
func flagSet(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	return fs
}

func requireFlag(value, name string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("-%s is required", name)
	}
	return nil
}

// ------------------------------------------------------------------ users

func upsertUser(db *sql.DB, phone, password, role string) error {
	if err := requireFlag(phone, "phone"); err != nil {
		return err
	}
	if err := requireFlag(password, "password"); err != nil {
		return err
	}
	if len(password) < 6 {
		return errors.New("password must be at least 6 characters")
	}
	if role != "admin" && role != "user" {
		return fmt.Errorf("role must be 'admin' or 'user', got %q", role)
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	var id int
	var created bool

	err = db.QueryRow(`
        INSERT INTO users (phone, password_hash, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                role          = EXCLUDED.role
        RETURNING id, (xmax = 0) AS created`,
		phone, hash, role,
	).Scan(&id, &created)

	if err != nil {
		return fmt.Errorf("saving user: %w", err)
	}

	verb := "updated"
	if created {
		verb = "created"
	}

	fmt.Printf("User %s: id=%d phone=%s role=%s\n", verb, id, phone, role)
	return nil
}

func cmdCreateAdmin(db *sql.DB, args []string) error {
	fs := flagSet("create-admin")
	phone := fs.String("phone", "admin", "Login identifier (phone number, or 'admin')")
	password := fs.String("password", "", "Password (required, min 6 characters)")
	fs.Parse(args)

	return upsertUser(db, *phone, *password, "admin")
}

func cmdCreateUser(db *sql.DB, args []string) error {
	fs := flagSet("create-user")
	phone := fs.String("phone", "", "Phone number (required)")
	password := fs.String("password", "", "Password (required, min 6 characters)")
	role := fs.String("role", "user", "Role: admin or user")
	fs.Parse(args)

	return upsertUser(db, *phone, *password, *role)
}

func cmdResetPassword(db *sql.DB, args []string) error {
	fs := flagSet("reset-password")
	phone := fs.String("phone", "", "Phone number (required)")
	password := fs.String("password", "", "New password (required, min 6 characters)")
	fs.Parse(args)

	if err := requireFlag(*phone, "phone"); err != nil {
		return err
	}
	if len(*password) < 6 {
		return errors.New("password must be at least 6 characters")
	}

	hash, err := utils.HashPassword(*password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	result, err := db.Exec("UPDATE users SET password_hash = $1 WHERE phone = $2", hash, *phone)
	if err != nil {
		return fmt.Errorf("updating password: %w", err)
	}

	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("no user with phone %q", *phone)
	}

	fmt.Printf("Password updated for %s\n", *phone)
	return nil
}

func cmdListUsers(db *sql.DB, args []string) error {
	fs := flagSet("list-users")
	limit := fs.Int("limit", 50, "Maximum rows")
	fs.Parse(args)

	rows, err := db.Query(`
        SELECT u.id, u.phone, u.role, u.created_at,
               (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id)
        FROM users u
        ORDER BY u.id
        LIMIT $1`, *limit)
	if err != nil {
		return err
	}
	defer rows.Close()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tPHONE\tROLE\tDEVICES\tCREATED")

	for rows.Next() {
		var id, devices int
		var phone, role string
		var createdAt sql.NullTime

		if err := rows.Scan(&id, &phone, &role, &createdAt, &devices); err != nil {
			return err
		}

		fmt.Fprintf(w, "%d\t%s\t%s\t%d\t%s\n",
			id, phone, role, devices, formatTime(createdAt))
	}

	w.Flush()
	return rows.Err()
}

// ---------------------------------------------------------------- devices

func cmdCreateDevice(db *sql.DB, args []string) error {
	fs := flagSet("create-device")
	serial := fs.String("serial", "", "Device serial (required)")
	secret := fs.String("secret", "", "Device secret (required)")
	owner := fs.String("user", "", "Phone number of the owner (optional)")
	active := fs.Bool("active", false, "Activate immediately (requires -user)")
	fs.Parse(args)

	if err := requireFlag(*serial, "serial"); err != nil {
		return err
	}
	if err := requireFlag(*secret, "secret"); err != nil {
		return err
	}
	if *active && *owner == "" {
		return errors.New("-active requires -user")
	}

	var ownerID *int
	if *owner != "" {
		id, err := lookupUserID(db, *owner)
		if err != nil {
			return err
		}
		ownerID = &id
	}

	var activatedAt interface{}
	if *active {
		activatedAt = "now"
	}

	_, err := db.Exec(`
        INSERT INTO devices (serial, device_secret, user_id, is_active, activated_at)
        VALUES ($1, $2, $3, $4, CASE WHEN $5::TEXT IS NULL THEN NULL ELSE NOW() END)
        ON CONFLICT (serial) DO UPDATE
            SET device_secret = EXCLUDED.device_secret,
                user_id       = EXCLUDED.user_id,
                is_active     = EXCLUDED.is_active,
                activated_at  = EXCLUDED.activated_at`,
		*serial, *secret, ownerID, *active, activatedAt,
	)
	if err != nil {
		return fmt.Errorf("saving device: %w", err)
	}

	fmt.Printf("Device saved: serial=%s active=%t owner=%s\n",
		*serial, *active, orDash(*owner))
	return nil
}

func cmdAssignDevice(db *sql.DB, args []string) error {
	fs := flagSet("assign-device")
	serial := fs.String("serial", "", "Device serial (required)")
	owner := fs.String("user", "", "Phone number of the owner (required)")
	fs.Parse(args)

	if err := requireFlag(*serial, "serial"); err != nil {
		return err
	}
	if err := requireFlag(*owner, "user"); err != nil {
		return err
	}

	ownerID, err := lookupUserID(db, *owner)
	if err != nil {
		return err
	}

	result, err := db.Exec(`
        UPDATE devices
        SET user_id = $1, is_active = TRUE, activated_at = NOW()
        WHERE serial = $2`,
		ownerID, *serial,
	)
	if err != nil {
		return fmt.Errorf("assigning device: %w", err)
	}

	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("no device with serial %q", *serial)
	}

	fmt.Printf("Device %s assigned to %s and activated\n", *serial, *owner)
	return nil
}

func cmdDeactivateDevice(db *sql.DB, args []string) error {
	fs := flagSet("deactivate-device")
	serial := fs.String("serial", "", "Device serial (required)")
	fs.Parse(args)

	if err := requireFlag(*serial, "serial"); err != nil {
		return err
	}

	result, err := db.Exec(`
        UPDATE devices
        SET user_id = NULL, is_active = FALSE, activated_at = NULL
        WHERE serial = $1`, *serial)
	if err != nil {
		return err
	}

	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("no device with serial %q", *serial)
	}

	fmt.Printf("Device %s deactivated\n", *serial)
	return nil
}

func cmdDeleteDevice(db *sql.DB, args []string) error {
	fs := flagSet("delete-device")
	serial := fs.String("serial", "", "Device serial (required)")
	yes := fs.Bool("yes", false, "Confirm deletion (required)")
	fs.Parse(args)

	if err := requireFlag(*serial, "serial"); err != nil {
		return err
	}
	if !*yes {
		return errors.New("refusing to delete without -yes (this also removes all location history)")
	}

	result, err := db.Exec("DELETE FROM devices WHERE serial = $1", *serial)
	if err != nil {
		return err
	}

	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("no device with serial %q", *serial)
	}

	fmt.Printf("Device %s deleted\n", *serial)
	return nil
}

func cmdListDevices(db *sql.DB, args []string) error {
	fs := flagSet("list-devices")
	limit := fs.Int("limit", 50, "Maximum rows")
	showSecrets := fs.Bool("secrets", false, "Include device secrets in the output")
	fs.Parse(args)

	rows, err := db.Query(`
        SELECT d.serial, d.device_secret, d.is_active,
               COALESCE(u.phone, ''), d.activated_at,
               (SELECT COUNT(*) FROM location_history lh WHERE lh.device_serial = d.serial)
        FROM devices d
        LEFT JOIN users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
        LIMIT $1`, *limit)
	if err != nil {
		return err
	}
	defer rows.Close()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	if *showSecrets {
		fmt.Fprintln(w, "SERIAL\tSECRET\tACTIVE\tOWNER\tPOINTS\tACTIVATED")
	} else {
		fmt.Fprintln(w, "SERIAL\tACTIVE\tOWNER\tPOINTS\tACTIVATED")
	}

	for rows.Next() {
		var serial, secret, owner string
		var active bool
		var activatedAt sql.NullTime
		var points int

		if err := rows.Scan(&serial, &secret, &active, &owner, &activatedAt, &points); err != nil {
			return err
		}

		if *showSecrets {
			fmt.Fprintf(w, "%s\t%s\t%t\t%s\t%d\t%s\n",
				serial, secret, active, orDash(owner), points, formatTime(activatedAt))
		} else {
			fmt.Fprintf(w, "%s\t%t\t%s\t%d\t%s\n",
				serial, active, orDash(owner), points, formatTime(activatedAt))
		}
	}

	w.Flush()

	if !*showSecrets {
		fmt.Println("\n(pass -secrets to reveal device secrets)")
	}

	return rows.Err()
}

// ------------------------------------------------------------------ misc

func cmdStats(db *sql.DB, args []string) error {
	queries := []struct {
		label string
		query string
	}{
		{"Users", "SELECT COUNT(*) FROM users"},
		{"  admins", "SELECT COUNT(*) FROM users WHERE role = 'admin'"},
		{"Devices", "SELECT COUNT(*) FROM devices"},
		{"  active", "SELECT COUNT(*) FROM devices WHERE is_active"},
		{"  unassigned", "SELECT COUNT(*) FROM devices WHERE user_id IS NULL"},
		{"Location points", "SELECT COUNT(*) FROM location_history"},
		{"  last 24h", "SELECT COUNT(*) FROM location_history WHERE recorded_at > NOW() - INTERVAL '24 hours'"},
		{"Audit log entries", "SELECT COUNT(*) FROM audit_logs"},
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	for _, q := range queries {
		var count int
		if err := db.QueryRow(q.query).Scan(&count); err != nil {
			return fmt.Errorf("%s: %w", q.label, err)
		}
		fmt.Fprintf(w, "%s\t%d\n", q.label, count)
	}

	return w.Flush()
}

// cmdHash prints a bcrypt hash, which is how the fixed hashes in seed.sql
// were produced.
func cmdHash(_ *sql.DB, args []string) error {
	fs := flagSet("hash")
	password := fs.String("password", "", "Password to hash (required)")
	fs.Parse(args)

	if err := requireFlag(*password, "password"); err != nil {
		return err
	}

	hash, err := utils.HashPassword(*password)
	if err != nil {
		return err
	}

	fmt.Println(hash)
	return nil
}

func lookupUserID(db *sql.DB, phone string) (int, error) {
	var id int
	err := db.QueryRow("SELECT id FROM users WHERE phone = $1", phone).Scan(&id)

	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("no user with phone %q (create one with: cli create-user -phone %s -password ...)", phone, phone)
	}
	if err != nil {
		return 0, err
	}

	return id, nil
}

func formatTime(t sql.NullTime) string {
	if !t.Valid {
		return "-"
	}
	return t.Time.Format("2006-01-02 15:04")
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
