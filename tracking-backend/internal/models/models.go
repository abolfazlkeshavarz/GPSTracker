package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID           int       `json:"id"`
	Phone        string    `json:"phone"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

type Device struct {
	Serial         string     `json:"serial"`
	Name           string     `json:"name,omitempty"`
	DeviceSecret   string     `json:"device_secret,omitempty"`
	UserID         *int       `json:"user_id,omitempty"` // Changed to pointer
	IsActive       bool       `json:"is_active"`
	ActivatedAt    *time.Time `json:"activated_at,omitempty"` // Changed to pointer
	CreatedBy      int        `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	LastModifiedAt time.Time  `json:"last_modified_at"` // NEW FIELD

	// Commercial / inventory. The serial is the tracking identity; the IMEI is
	// what the carrier and the regulator know the unit by.
	IMEI           string     `json:"imei,omitempty"`
	Model          string     `json:"model,omitempty"`
	SIMMSISDN      string     `json:"sim_msisdn,omitempty"`
	PurchaseDate   *time.Time `json:"purchase_date,omitempty"`
	WarrantyMonths int        `json:"warranty_months,omitempty"`
	Notes          string     `json:"notes,omitempty"`

	// Populated on the device list so a dashboard can show expiry without a
	// request per device.
	Subscription *Subscription `json:"subscription,omitempty"`
}

// UpdateDeviceInventoryRequest edits the commercial fields. Admin-only:
// these are what warranty and support decisions are made from.
type UpdateDeviceInventoryRequest struct {
	IMEI           *string `json:"imei,omitempty"`
	Model          *string `json:"model,omitempty"`
	SIMMSISDN      *string `json:"sim_msisdn,omitempty"`
	PurchaseDate   *string `json:"purchase_date,omitempty"` // YYYY-MM-DD
	WarrantyMonths *int    `json:"warranty_months,omitempty"`
	Notes          *string `json:"notes,omitempty"`
}

type AssignDeviceRequest struct {
	UserID int `json:"user_id" binding:"required"`
}

type LocationMessage struct {
	Device     string  `json:"device"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	Speed      int     `json:"speed"`
	Satellites int     `json:"sat"`
	CSQ        int     `json:"csq,omitempty"`

	// NEW FIELDS
	Battery   float64 `json:"battery,omitempty"`
	Operator  string  `json:"operator,omitempty"`
	Ignition  bool    `json:"ignition,omitempty"`
	Timestamp int64   `json:"timestamp,omitempty"`

	// Heading is course over ground in degrees (0-360). Needed to orient the
	// vehicle icon and to render direction along a history trail.
	Heading  float64 `json:"heading,omitempty"`
	Altitude float64 `json:"altitude,omitempty"`
	// HDOP is horizontal dilution of precision: a direct accuracy estimate,
	// far more meaningful than the satellite count alone. Lower is better.
	HDOP float64 `json:"hdop,omitempty"`
	// FixAgeMs is how stale the GPS fix was when it was published. A large
	// value means the position is the last known one, not the current one.
	FixAgeMs int `json:"fix_age_ms,omitempty"`

	// ExtPower reports whether the vehicle supply is still connected. The
	// device keeps reporting on its backup cell when it is not, which is how
	// a cut battery is told apart from a unit that simply went quiet.
	ExtPower *bool `json:"ext_power,omitempty"`
	// Jamming is the modem's GSM interference flag.
	Jamming *bool `json:"jamming,omitempty"`
	// Event carries a one-shot accelerometer or panic event: "impact",
	// "harsh_accel", "harsh_brake", "harsh_corner", "sos".
	Event string `json:"event,omitempty"`
	// AccelG is the peak acceleration for an impact/harsh event, in g.
	AccelG float64 `json:"accel_g,omitempty"`
}

type LocationHistory struct {
	ID           int64     `json:"id"`
	DeviceSerial string    `json:"device_serial"`
	Lat          float64   `json:"lat"`
	Lng          float64   `json:"lng"`
	Speed        int       `json:"speed"`
	Satellites   int       `json:"satellites"`
	CSQ          int       `json:"csq"`
	Battery      float64   `json:"battery"`
	RecordedAt   time.Time `json:"recorded_at"`
}

type SignalQuality struct {
	DeviceSerial string    `json:"device_serial"`
	GPSBars      int       `json:"gps_bars"`  // 0-5 based on satellites
	GPRSBars     int       `json:"gprs_bars"` // 0-5 based on CSQ
	Satellites   int       `json:"satellites"`
	CSQ          int       `json:"csq"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type RegisterRequest struct {
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

type LoginRequest struct {
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type ActivateDeviceRequest struct {
	Serial string `json:"serial" binding:"required"`
	Secret string `json:"secret" binding:"required"`
}

type AdminCreateDeviceRequest struct {
	Serial       string `json:"serial" binding:"required"`
	DeviceSecret string `json:"device_secret" binding:"required"`
}

type AdminUpdateDeviceRequest struct {
	DeviceSecret string `json:"device_secret,omitempty"`
	UserID       *int   `json:"user_id,omitempty"`
	IsActive     *bool  `json:"is_active,omitempty"`
}

// ---------------------------------------------------------------- tracking

// TrackPoint is one stored GPS fix, as returned by the track endpoint.
type TrackPoint struct {
	Lat        float64  `json:"lat"`
	Lng        float64  `json:"lng"`
	Speed      int      `json:"speed"`
	Satellites int      `json:"satellites"`
	CSQ        int      `json:"csq"`
	Battery    float64  `json:"battery"`
	Ignition   *bool    `json:"ignition,omitempty"`
	Heading    *float64 `json:"heading,omitempty"`
	Altitude   *float64 `json:"altitude,omitempty"`
	HDOP       *float64 `json:"hdop,omitempty"`
	// IsBackfill marks a point that was buffered through a coverage gap and
	// replayed later, rather than arriving live.
	IsBackfill bool      `json:"is_backfill,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

// TrackStop is a period the vehicle spent parked in one place.
//
// Detected rather than reported: the firmware has no "parked" signal, so a
// stop is inferred from consecutive fixes staying inside a small radius for
// longer than a minimum duration.
type TrackStop struct {
	Lat             float64   `json:"lat"`
	Lng             float64   `json:"lng"`
	ArrivedAt       time.Time `json:"arrived_at"`
	DepartedAt      time.Time `json:"departed_at"`
	DurationSeconds int       `json:"duration_seconds"`
	// Human-readable duration, e.g. "1h 24m", so every client does not have
	// to reimplement the same formatting.
	Duration   string `json:"duration"`
	PointCount int    `json:"point_count"`
}

// TrackSummary aggregates a whole track.
type TrackSummary struct {
	DistanceKm      float64   `json:"distance_km"`
	PointCount      int       `json:"point_count"`
	StopCount       int       `json:"stop_count"`
	MaxSpeed        int       `json:"max_speed"`
	AvgMovingSpeed  int       `json:"avg_moving_speed"`
	TotalSeconds    int       `json:"total_seconds"`
	MovingSeconds   int       `json:"moving_seconds"`
	StoppedSeconds  int       `json:"stopped_seconds"`
	TotalDuration   string    `json:"total_duration"`
	MovingDuration  string    `json:"moving_duration"`
	StoppedDuration string    `json:"stopped_duration"`
	FirstRecordedAt time.Time `json:"first_recorded_at,omitempty"`
	LastRecordedAt  time.Time `json:"last_recorded_at,omitempty"`
}

// TrackResponse is the payload of GET /api/devices/:serial/track.
type TrackResponse struct {
	Device  string       `json:"device"`
	From    time.Time    `json:"from"`
	To      time.Time    `json:"to"`
	Points  []TrackPoint `json:"points"`
	Stops   []TrackStop  `json:"stops"`
	Summary TrackSummary `json:"summary"`
	// Truncated reports that the range held more points than the limit, so
	// the track is incomplete and the client should narrow the range.
	Truncated bool `json:"truncated"`
}

// ---------------------------------------------------------------- odometer

// Odometer is a device's lifetime distance total. TotalMeters is the stored
// value; TotalKm is the rounded convenience figure the UI shows.
type Odometer struct {
	Device      string     `json:"device"`
	TotalMeters float64    `json:"total_meters"`
	TotalKm     float64    `json:"total_km"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

// SetOdometerRequest sets the odometer to an explicit reading, e.g. to match
// the vehicle's dashboard when a tracker is first fitted, or to reset to zero.
// A pointer so that 0 is an accepted value rather than a missing field.
type SetOdometerRequest struct {
	TotalKm *float64 `json:"total_km" binding:"required"`
}

// ------------------------------------------------------------- geofences

type Geofence struct {
	ID           int64     `json:"id"`
	DeviceSerial string    `json:"device_serial"`
	Name         string    `json:"name"`
	Lat          float64   `json:"lat"`
	Lng          float64   `json:"lng"`
	RadiusM      int       `json:"radius_m"`
	TriggerOn    string    `json:"trigger_on"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

type CreateGeofenceRequest struct {
	Name      string  `json:"name" binding:"required"`
	Lat       float64 `json:"lat" binding:"required"`
	Lng       float64 `json:"lng" binding:"required"`
	RadiusM   int     `json:"radius_m" binding:"required"`
	TriggerOn string  `json:"trigger_on"`
}

// ---------------------------------------------------------------- alerts

type Alert struct {
	ID           int64  `json:"id"`
	DeviceSerial string `json:"device_serial"`
	Kind         string `json:"kind"`
	// Severity drives how loudly a client presents the alert: 'info',
	// 'warning' or 'critical'. Derived from the kind so it cannot drift.
	Severity   string    `json:"severity"`
	Title      string    `json:"title"`
	Detail     string    `json:"detail,omitempty"`
	Lat        *float64  `json:"lat,omitempty"`
	Lng        *float64  `json:"lng,omitempty"`
	GeofenceID *int64    `json:"geofence_id,omitempty"`
	IsRead     bool      `json:"is_read"`
	CreatedAt  time.Time `json:"created_at"`
}

// ------------------------------------------------------------ subscription

// Subscription is a device's platform access window. Sold per unit, because
// that is how the hardware is sold: one tracker, one plan.
type Subscription struct {
	DeviceSerial string    `json:"device_serial"`
	Plan         string    `json:"plan"`
	StartedAt    time.Time `json:"started_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	// Derived, so every client does not reimplement the same date arithmetic.
	DaysRemaining int  `json:"days_remaining"`
	IsActive      bool `json:"is_active"`
	IsExpiring    bool `json:"is_expiring"`
}

// Warranty is the hardware replacement window, independent of the service
// plan: a unit can be out of subscription but still under warranty.
type Warranty struct {
	DeviceSerial  string     `json:"device_serial"`
	PurchaseDate  *time.Time `json:"purchase_date,omitempty"`
	Months        int        `json:"months"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	DaysRemaining int        `json:"days_remaining"`
	IsActive      bool       `json:"is_active"`
}

// RenewSubscriptionRequest extends a plan by a number of months.
type RenewSubscriptionRequest struct {
	Plan   string `json:"plan" binding:"required"`
	Months int    `json:"months" binding:"required,min=1,max=120"`
}

// ---------------------------------------------------------- device settings

// DeviceSettings is everything an owner can tune per unit — the configurator.
type DeviceSettings struct {
	DeviceSerial      string    `json:"device_serial"`
	SpeedLimitKmh     int       `json:"speed_limit_kmh"`
	ReportIntervalS   int       `json:"report_interval_s"`
	AlertOverspeed    bool      `json:"alert_overspeed"`
	AlertIgnition     bool      `json:"alert_ignition"`
	AlertTow          bool      `json:"alert_tow"`
	AlertImpact       bool      `json:"alert_impact"`
	AlertHarshDriving bool      `json:"alert_harsh_driving"`
	AlertPowerCut     bool      `json:"alert_power_cut"`
	AlertJamming      bool      `json:"alert_jamming"`
	AlertLowBattery   bool      `json:"alert_low_battery"`
	AlertGeofence     bool      `json:"alert_geofence"`
	AlertOffline      bool      `json:"alert_offline"`
	SilentMode        bool      `json:"silent_mode"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UpdateDeviceSettingsRequest patches settings. Every field is a pointer so
// that omitting one leaves it alone, and sending `false` actually clears it —
// indistinguishable otherwise.
type UpdateDeviceSettingsRequest struct {
	SpeedLimitKmh     *int  `json:"speed_limit_kmh,omitempty"`
	ReportIntervalS   *int  `json:"report_interval_s,omitempty"`
	AlertOverspeed    *bool `json:"alert_overspeed,omitempty"`
	AlertIgnition     *bool `json:"alert_ignition,omitempty"`
	AlertTow          *bool `json:"alert_tow,omitempty"`
	AlertImpact       *bool `json:"alert_impact,omitempty"`
	AlertHarshDriving *bool `json:"alert_harsh_driving,omitempty"`
	AlertPowerCut     *bool `json:"alert_power_cut,omitempty"`
	AlertJamming      *bool `json:"alert_jamming,omitempty"`
	AlertLowBattery   *bool `json:"alert_low_battery,omitempty"`
	AlertGeofence     *bool `json:"alert_geofence,omitempty"`
	AlertOffline      *bool `json:"alert_offline,omitempty"`
	SilentMode        *bool `json:"silent_mode,omitempty"`
}

// ---------------------------------------------------------- device commands

// DeviceCommand is one queued instruction to a unit.
type DeviceCommand struct {
	ID           int64           `json:"id"`
	DeviceSerial string          `json:"device_serial"`
	Command      string          `json:"command"`
	Params       json.RawMessage `json:"params,omitempty"`
	Status       string          `json:"status"`
	IssuedAt     time.Time       `json:"issued_at"`
	SentAt       *time.Time      `json:"sent_at,omitempty"`
	AckedAt      *time.Time      `json:"acked_at,omitempty"`
	Result       string          `json:"result,omitempty"`
}

// IssueCommandRequest asks a device to do something.
//
// Confirm is required for the commands that can strand a vehicle: cutting the
// engine of a car that is moving is a safety decision, not a UI click. The
// server enforces it so a bare API call cannot bypass the confirmation the
// interface shows.
type IssueCommandRequest struct {
	Command   string `json:"command" binding:"required"`
	IntervalS int    `json:"interval_s,omitempty"`
	Confirm   bool   `json:"confirm,omitempty"`
}

// ------------------------------------------------------------- web push

// PushSubscribeRequest is the browser's PushSubscription, as produced by
// PushManager.subscribe().
type PushSubscribeRequest struct {
	Endpoint string `json:"endpoint" binding:"required"`
	Keys     struct {
		P256dh string `json:"p256dh" binding:"required"`
		Auth   string `json:"auth" binding:"required"`
	} `json:"keys" binding:"required"`
}

// ----------------------------------------------------------- self-service

type UpdateMeRequest struct {
	Name string `json:"name,omitempty"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

type RenameDeviceRequest struct {
	Name string `json:"name" binding:"required,max=80"`
}

type AuditLog struct {
	ID         int             `json:"id"`
	UserID     *int            `json:"user_id,omitempty"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   string          `json:"entity_id"`
	Details    json.RawMessage `json:"details,omitempty"`
	IPAddress  string          `json:"ip_address"`
	CreatedAt  time.Time       `json:"created_at"`
}
