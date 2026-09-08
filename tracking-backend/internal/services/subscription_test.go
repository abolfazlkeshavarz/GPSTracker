package services

import (
	"testing"
	"time"
)

var subNow = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func TestSubscriptionStatusActive(t *testing.T) {
	days, active, expiring := SubscriptionStatus(subNow.AddDate(0, 0, 45), subNow)

	if !active {
		t.Error("a plan 45 days out should be active")
	}
	if expiring {
		t.Error("45 days out should not be flagged as expiring")
	}
	if days != 45 {
		t.Errorf("days = %d, want 45", days)
	}
}

func TestSubscriptionStatusExpiring(t *testing.T) {
	// Inside the warning window: still usable, but the customer must be told.
	days, active, expiring := SubscriptionStatus(subNow.AddDate(0, 0, ExpiryWarningDays), subNow)

	if !active || !expiring {
		t.Errorf("at the warning boundary: active=%v expiring=%v, want true/true", active, expiring)
	}
	if days != ExpiryWarningDays {
		t.Errorf("days = %d, want %d", days, ExpiryWarningDays)
	}
}

func TestSubscriptionStatusExpired(t *testing.T) {
	days, active, expiring := SubscriptionStatus(subNow.Add(-time.Second), subNow)

	if active || expiring {
		t.Errorf("a lapsed plan: active=%v expiring=%v, want false/false", active, expiring)
	}
	if days != 0 {
		t.Errorf("days = %d, want 0", days)
	}
}

func TestSubscriptionStatusRoundsPartialDayUp(t *testing.T) {
	// Six hours left is one day left, not zero. Reporting zero while access
	// still works reads as a bug to the customer.
	days, active, _ := SubscriptionStatus(subNow.Add(6*time.Hour), subNow)

	if !active {
		t.Fatal("six hours remaining should still be active")
	}
	if days != 1 {
		t.Errorf("days = %d, want 1", days)
	}
}

func TestWarrantyExpiryIsCalendarMonths(t *testing.T) {
	purchase := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	got := WarrantyExpiry(&purchase, DefaultWarrantyMonths)
	if got == nil {
		t.Fatal("expected an expiry date")
	}

	// 18 calendar months from 2026-01-31 is 2027-07-31.
	want := time.Date(2027, 7, 31, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("WarrantyExpiry = %v, want %v", got, want)
	}
}

func TestWarrantyExpiryUnknownWithoutPurchaseDate(t *testing.T) {
	// A unit still in stock has no warranty clock running.
	if got := WarrantyExpiry(nil, DefaultWarrantyMonths); got != nil {
		t.Errorf("WarrantyExpiry(nil) = %v, want nil", got)
	}

	purchase := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if got := WarrantyExpiry(&purchase, 0); got != nil {
		t.Errorf("WarrantyExpiry with 0 months = %v, want nil", got)
	}
}
