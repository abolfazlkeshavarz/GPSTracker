package models

import (
    "time"
)

type User struct {
    ID           int       `json:"id"`
    Phone        string    `json:"phone"`
    PasswordHash string    `json:"-"`
    CreatedAt    time.Time `json:"created_at"`
}

type Device struct {
    Serial      string    `json:"serial"`
    UserID      int       `json:"user_id"`
    ActivatedAt time.Time `json:"activated_at"`
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

type ActivateDeviceRequest struct {
    Serial string `json:"serial" binding:"required"`
}

type LoginResponse struct {
    Token string `json:"token"`
    User  User   `json:"user"`
}