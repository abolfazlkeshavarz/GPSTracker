package services

import (
	"database/sql"
	"math"
	"time"
)

/*
Subscriptions and warranty.

Two separate clocks that are easy to conflate, so they are modelled apart:

  - The SUBSCRIPTION is platform access. It is sold per unit, starts when the
    customer activates the device, and has to be renewed. Letting it lapse
    stops new data being useful to them; it does not brick the hardware.

  - The WARRANTY is the hardware replacement window. It runs from the purchase
    date, not from activation — a unit that sat in a drawer for two months
    still only has sixteen months of cover left. A device can be out of
    subscription but under warranty, and vice versa.
*/

const (
	// TrialDays is the free platform access every unit ships with. Three
	// months, matching what is printed on the box.
	TrialDays = 90

	// DefaultWarrantyMonths matches the replacement warranty on the box.
	DefaultWarrantyMonths = 18

	// ExpiryWarningDays is how far ahead of a lapse the customer is told.
	// Long enough to actually renew before losing access, short enough that
	// the warning still feels relevant.
	ExpiryWarningDays = 7
)

// SubscriptionStatus derives the presentation state of a plan.
//
// daysRemaining is rounded up: a plan with six hours left has one day left,
// not zero. Reporting zero while access still works reads as a bug.
func SubscriptionStatus(expiresAt, now time.Time) (daysRemaining int, active, expiring bool) {
	remaining := expiresAt.Sub(now)

	if remaining <= 0 {
		return 0, false, false
	}

	daysRemaining = int(math.Ceil(remaining.Hours() / 24))
	active = true
	expiring = daysRemaining <= ExpiryWarningDays

	return daysRemaining, active, expiring
}

// WarrantyExpiry returns when hardware cover ends, or nil when the purchase
// date is unknown — an unsold unit has no warranty clock running yet.
func WarrantyExpiry(purchaseDate *time.Time, months int) *time.Time {
	if purchaseDate == nil || months <= 0 {
		return nil
	}

	// AddDate on months, not 30-day arithmetic: "18 months" is a calendar
	// promise, and a customer who bought on the 3rd expects the 3rd.
	end := purchaseDate.AddDate(0, months, 0)
	return &end
}

// EnsureTrial starts the free trial for a device that has none.
//
// Idempotent: activating a device that already has a plan (a replacement unit
// re-registered by the same customer, say) must not silently hand out another
// three free months.
func EnsureTrial(pg *sql.DB, serial string) error {
	_, err := pg.Exec(`
        INSERT INTO device_subscription (device_serial, plan, started_at, expires_at)
        VALUES ($1, 'trial', NOW(), NOW() + make_interval(days => $2))
        ON CONFLICT (device_serial) DO NOTHING`,
		serial, TrialDays)

	return err
}

// Renew extends a device's plan. Renewing from an unexpired plan adds to the
// remaining time rather than discarding it; renewing after a lapse starts from
// now, so a customer who forgot for a month does not pay for that month.
func Renew(pg *sql.DB, serial, plan string, months int) error {
	_, err := pg.Exec(`
        INSERT INTO device_subscription (device_serial, plan, started_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + make_interval(months => $3))
        ON CONFLICT (device_serial) DO UPDATE
            SET plan       = EXCLUDED.plan,
                expires_at = GREATEST(device_subscription.expires_at, NOW())
                             + make_interval(months => $3),
                -- Clear the notification markers so the next lapse warns again.
                warned_at  = NULL,
                expired_at = NULL,
                updated_at = NOW()`,
		serial, plan, months)

	return err
}
