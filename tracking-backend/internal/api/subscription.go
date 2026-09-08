package api

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"tracking-backend/internal/db"
	"tracking-backend/internal/models"
	"tracking-backend/internal/services"

	"github.com/gin-gonic/gin"
)

/*
Plan and warranty, the commercial side of a unit.

Owners can read both. Only an admin can change them — a customer being able to
extend their own subscription would make the whole thing decorative, and the
warranty window is a claim the seller honours, not one the buyer sets.
*/

// GetDeviceSubscription returns plan and warranty status for one device.
func GetDeviceSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")
	serial := c.Param("serial")

	if !deviceBelongsToUser(userID, serial) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	sub, err := loadSubscription(serial)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	warranty, err := loadWarranty(serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		// Null rather than a fabricated plan: a device that has never been
		// activated genuinely has no subscription, and saying "expired" would
		// be wrong in a different way.
		"subscription": sub,
		"warranty":     warranty,
	})
}

// AdminRenewSubscription extends or changes a device's plan.
func AdminRenewSubscription(c *gin.Context) {
	serial := c.Param("serial")

	var req models.RenewSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch req.Plan {
	case "trial", "basic", "pro":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan must be 'trial', 'basic' or 'pro'"})
		return
	}

	var exists bool
	if err := db.DB.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM devices WHERE serial = $1)", serial,
	).Scan(&exists); err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	if err := services.Renew(db.DB, serial, req.Plan, req.Months); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not renew subscription"})
		return
	}

	logAdminAction(c, "RENEW_SUBSCRIPTION", "device", serial,
		map[string]any{"plan": req.Plan, "months": req.Months})

	sub, err := loadSubscription(serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, sub)
}

// AdminUpdateInventory edits the commercial/support fields on a unit.
func AdminUpdateInventory(c *gin.Context) {
	serial := c.Param("serial")

	var req models.UpdateDeviceInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parsed here so a malformed date is a 400 rather than a Postgres 500.
	var purchase interface{}
	if req.PurchaseDate != nil {
		if *req.PurchaseDate == "" {
			purchase = nil
		} else {
			t, err := time.Parse("2006-01-02", *req.PurchaseDate)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "purchase_date must be YYYY-MM-DD"})
				return
			}
			purchase = t
		}
	}

	if req.WarrantyMonths != nil && (*req.WarrantyMonths < 0 || *req.WarrantyMonths > 120) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "warranty_months must be between 0 and 120"})
		return
	}

	res, err := db.DB.Exec(`
        UPDATE devices SET
            imei            = COALESCE($2, imei),
            model           = COALESCE($3, model),
            sim_msisdn      = COALESCE($4, sim_msisdn),
            purchase_date   = CASE WHEN $5::boolean THEN $6::date ELSE purchase_date END,
            warranty_months = COALESCE($7, warranty_months),
            notes           = COALESCE($8, notes)
        WHERE serial = $1`,
		serial, req.IMEI, req.Model, req.SIMMSISDN,
		req.PurchaseDate != nil, purchase,
		req.WarrantyMonths, req.Notes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update device"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	logAdminAction(c, "UPDATE_INVENTORY", "device", serial, req)

	warranty, err := loadWarranty(serial)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device updated", "warranty": warranty})
}

/* ---------------------------------------------------------------- loaders */

func loadSubscription(serial string) (*models.Subscription, error) {
	var s models.Subscription
	err := db.DB.QueryRow(`
        SELECT device_serial, plan, started_at, expires_at
        FROM device_subscription WHERE device_serial = $1`, serial,
	).Scan(&s.DeviceSerial, &s.Plan, &s.StartedAt, &s.ExpiresAt)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	s.DaysRemaining, s.IsActive, s.IsExpiring = services.SubscriptionStatus(s.ExpiresAt, time.Now())
	return &s, nil
}

func loadWarranty(serial string) (*models.Warranty, error) {
	var w models.Warranty
	var purchase sql.NullTime

	err := db.DB.QueryRow(
		"SELECT serial, purchase_date, warranty_months FROM devices WHERE serial = $1", serial,
	).Scan(&w.DeviceSerial, &purchase, &w.Months)
	if err != nil {
		return nil, err
	}

	if purchase.Valid {
		w.PurchaseDate = &purchase.Time
	}

	w.ExpiresAt = services.WarrantyExpiry(w.PurchaseDate, w.Months)
	if w.ExpiresAt != nil {
		w.DaysRemaining, w.IsActive, _ = services.SubscriptionStatus(*w.ExpiresAt, time.Now())
	}

	return &w, nil
}
