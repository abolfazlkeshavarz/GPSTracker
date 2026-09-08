package mqtt

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"tracking-backend/internal/services"

	"github.com/redis/go-redis/v9"
)

/*
Subscription expiry notices.

Like the offline rule, this has no triggering message to hang off — a plan
lapsing is the absence of an event — so it is swept on a timer.

Each device gets at most one warning and one expiry notice per billing cycle.
The warned_at / expired_at markers are what enforce that; without them a daily
sweep would re-alert every pass, and the renewal reminder would train people
to ignore it.
*/

// EvaluateSubscriptions raises the "expiring soon" and "expired" notices.
func EvaluateSubscriptions(pg *sql.DB, rdb *redis.Client) {
	warnExpiring(pg, rdb)
	warnExpired(pg, rdb)
}

func warnExpiring(pg *sql.DB, rdb *redis.Client) {
	// The UPDATE ... RETURNING claims the rows and marks them in one statement,
	// so two overlapping sweeps cannot both notify the same customer.
	rows, err := pg.Query(`
        UPDATE device_subscription s
        SET warned_at = NOW()
        FROM devices d
        WHERE d.serial = s.device_serial
          AND d.user_id IS NOT NULL
          AND s.warned_at IS NULL
          AND s.expires_at > NOW()
          AND s.expires_at <= NOW() + make_interval(days => $1)
        RETURNING s.device_serial, d.user_id, s.expires_at, s.plan`,
		services.ExpiryWarningDays)
	if err != nil {
		log.Println("subscription warning sweep error:", err)
		return
	}

	type row struct {
		serial    string
		userID    int64
		expiresAt time.Time
		plan      string
	}

	var due []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.serial, &r.userID, &r.expiresAt, &r.plan); err != nil {
			continue
		}
		due = append(due, r)
	}
	rows.Close()

	for _, r := range due {
		days, _, _ := services.SubscriptionStatus(r.expiresAt, time.Now())

		title := fmt.Sprintf("%s: tracking plan expires in %d day(s)", r.serial, days)
		detail := fmt.Sprintf("The %s plan ends on %s. Renew to keep tracking and alerts.",
			r.plan, r.expiresAt.Format("2006-01-02"))

		insertAlert(pg, rdb, r.userID, r.serial, "subscription_expiring", title, detail, nil, nil, nil, false)
	}
}

func warnExpired(pg *sql.DB, rdb *redis.Client) {
	rows, err := pg.Query(`
        UPDATE device_subscription s
        SET expired_at = NOW()
        FROM devices d
        WHERE d.serial = s.device_serial
          AND d.user_id IS NOT NULL
          AND s.expired_at IS NULL
          AND s.expires_at <= NOW()
        RETURNING s.device_serial, d.user_id`)
	if err != nil {
		log.Println("subscription expiry sweep error:", err)
		return
	}

	type row struct {
		serial string
		userID int64
	}

	var due []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.serial, &r.userID); err != nil {
			continue
		}
		due = append(due, r)
	}
	rows.Close()

	for _, r := range due {
		insertAlert(pg, rdb, r.userID, r.serial, "subscription_expired",
			r.serial+": tracking plan has expired",
			"Live tracking and alerts are paused for this device until the plan is renewed.",
			nil, nil, nil, false)
	}
}

/* ------------------------------------------------------------- sweeper */

var subscriptionSweepStop chan struct{}

// StartSubscriptionSweeper periodically checks for lapsing and lapsed plans.
//
// Hourly rather than per-minute: expiry is a calendar-scale event, and an
// hour's delay on a renewal reminder is invisible to a customer.
func StartSubscriptionSweeper(pg *sql.DB, rdb *redis.Client, interval time.Duration) {
	subscriptionSweepStop = make(chan struct{})
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Run once at startup so a server that was down over an expiry date still
	// notifies, rather than waiting a full interval.
	EvaluateSubscriptions(pg, rdb)

	for {
		select {
		case <-ticker.C:
			EvaluateSubscriptions(pg, rdb)
		case <-subscriptionSweepStop:
			return
		}
	}
}

// StopSubscriptionSweeper stops the goroutine started above.
func StopSubscriptionSweeper() {
	if subscriptionSweepStop != nil {
		close(subscriptionSweepStop)
	}
}
