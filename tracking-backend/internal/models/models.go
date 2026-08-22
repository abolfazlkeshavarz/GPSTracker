package models

import (
    "time"
    "encoding/json"
)

type User struct {
    ID           int       `json:"id"`
    Phone        string    `json:"phone"`
    PasswordHash string    `json:"-"`
    Role         string    `json:"role"`
    CreatedAt    time.Time `json:"created_at"`
}

type Device struct {
    Serial      string     `json:"serial"`
    DeviceSecret string    `json:"device_secret,omitempty"`
    UserID      *int       `json:"user_id,omitempty"`      // Changed to pointer
    IsActive    bool       `json:"is_active"`
    ActivatedAt *time.Time `json:"activated_at,omitempty"` // Changed to pointer
    CreatedBy   int        `json:"created_by"`
    CreatedAt   time.Time  `json:"created_at"`
    LastModifiedAt time.Time  `json:"last_modified_at"`  // NEW FIELD

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
    Battery    float64 `json:"battery,omitempty"`
    Operator   string  `json:"operator,omitempty"`
    Ignition   bool    `json:"ignition,omitempty"`
    Timestamp  int64   `json:"timestamp,omitempty"`

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
    GPSBars      int       `json:"gps_bars"`   // 0-5 based on satellites
    GPRSBars     int       `json:"gprs_bars"`  // 0-5 based on CSQ
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
    Lat        float64   `json:"lat"`
    Lng        float64   `json:"lng"`
    Speed      int       `json:"speed"`
    Satellites int       `json:"satellites"`
    CSQ        int       `json:"csq"`
    Battery    float64   `json:"battery"`
    Ignition   *bool     `json:"ignition,omitempty"`
    Heading    *float64  `json:"heading,omitempty"`
    Altitude   *float64  `json:"altitude,omitempty"`
    HDOP       *float64  `json:"hdop,omitempty"`
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
    DistanceKm       float64   `json:"distance_km"`
    PointCount       int       `json:"point_count"`
    StopCount        int       `json:"stop_count"`
    MaxSpeed         int       `json:"max_speed"`
    AvgMovingSpeed   int       `json:"avg_moving_speed"`
    TotalSeconds     int       `json:"total_seconds"`
    MovingSeconds    int       `json:"moving_seconds"`
    StoppedSeconds   int       `json:"stopped_seconds"`
    TotalDuration    string    `json:"total_duration"`
    MovingDuration   string    `json:"moving_duration"`
    StoppedDuration  string    `json:"stopped_duration"`
    FirstRecordedAt  time.Time `json:"first_recorded_at,omitempty"`
    LastRecordedAt   time.Time `json:"last_recorded_at,omitempty"`
}

// TrackResponse is the payload of GET /api/devices/:serial/track.
type TrackResponse struct {
    Device string       `json:"device"`
    From   time.Time    `json:"from"`
    To     time.Time    `json:"to"`
    Points []TrackPoint `json:"points"`
    Stops  []TrackStop  `json:"stops"`
    Summary TrackSummary `json:"summary"`
    // Truncated reports that the range held more points than the limit, so
    // the track is incomplete and the client should narrow the range.
    Truncated bool `json:"truncated"`
}

type AuditLog struct {
    ID        int             `json:"id"`
    UserID    *int            `json:"user_id,omitempty"`
    Action    string          `json:"action"`
    EntityType string         `json:"entity_type"`
    EntityID  string          `json:"entity_id"`
    Details   json.RawMessage `json:"details,omitempty"`
    IPAddress string          `json:"ip_address"`
    CreatedAt time.Time       `json:"created_at"`
}