package integrity

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

/*
Trip certificates.

A certificate is a self-contained JSON document stating that a given device
was at a given set of positions over a given period, signed by the server with
Ed25519.

Ed25519 rather than an HMAC on purpose: an HMAC can only be checked by someone
holding the same secret key, which means the operator verifying their own
claim. Ed25519 is asymmetric, so the public key can be published and an
insurer, a court expert or a customer can verify the document without trusting
the operator and without being able to forge one.

What a certificate does and does not prove:

  - It proves the server held exactly these records, unmodified, at signing
    time, and that they form an unbroken hash chain.
  - For points marked "hmac" it also proves the payload came from something
    holding the device secret.
  - It does NOT prove the vehicle was physically there. A device can be moved,
    its secret extracted, or its GPS spoofed. The certificate is evidence about
    the data, not about the world.

That distinction is stated in the document itself so nobody over-claims it.
*/

// KeyPair is the server signing identity.
type KeyPair struct {
	Public  ed25519.PublicKey
	Private ed25519.PrivateKey
}

// GenerateKeyPair creates a new signing identity.
func GenerateKeyPair() (KeyPair, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return KeyPair{}, err
	}
	return KeyPair{Public: pub, Private: priv}, nil
}

// EncodePrivateKey renders a private key for storage in configuration.
func EncodePrivateKey(k KeyPair) string {
	return base64.StdEncoding.EncodeToString(k.Private)
}

// ParsePrivateKey loads a base64 seed or full private key from configuration.
func ParsePrivateKey(encoded string) (KeyPair, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return KeyPair{}, fmt.Errorf("signing key is not valid base64: %w", err)
	}

	switch len(raw) {
	case ed25519.PrivateKeySize: // 64 bytes: seed + public half
		priv := ed25519.PrivateKey(raw)
		return KeyPair{Private: priv, Public: priv.Public().(ed25519.PublicKey)}, nil

	case ed25519.SeedSize: // 32 bytes: seed only
		priv := ed25519.NewKeyFromSeed(raw)
		return KeyPair{Private: priv, Public: priv.Public().(ed25519.PublicKey)}, nil

	default:
		return KeyPair{}, fmt.Errorf(
			"signing key must be %d or %d bytes, got %d",
			ed25519.SeedSize, ed25519.PrivateKeySize, len(raw))
	}
}

// PublicKeyHex renders the public key for publication.
func (k KeyPair) PublicKeyHex() string {
	return hex.EncodeToString(k.Public)
}

// CertificatePoint is one position inside a certificate.
type CertificatePoint struct {
	RecordedAt time.Time `json:"recorded_at"`
	Lat        float64   `json:"lat"`
	Lng        float64   `json:"lng"`
	Speed      int       `json:"speed"`
	Backfilled bool      `json:"backfilled,omitempty"`
	Auth       string    `json:"auth"`
	Hash       string    `json:"hash"`
}

// CertificateBody is everything the signature covers.
//
// Field order here is the JSON field order, and the signature is taken over
// the marshalled bytes of this struct — so a verifier must re-marshal with the
// same field order. Go's encoding/json preserves struct order, which makes
// this reproducible.
type CertificateBody struct {
	Version      string `json:"version"`
	DeviceSerial string `json:"device_serial"`
	Owner        string `json:"owner,omitempty"`

	From time.Time `json:"from"`
	To   time.Time `json:"to"`

	IssuedAt time.Time `json:"issued_at"`
	Issuer   string    `json:"issuer"`

	PointCount    int `json:"point_count"`
	HMACCount     int `json:"hmac_count"`
	LegacyCount   int `json:"legacy_count"`
	BackfillCount int `json:"backfill_count"`

	DistanceKm     float64 `json:"distance_km"`
	MovingSeconds  int     `json:"moving_seconds"`
	StoppedSeconds int     `json:"stopped_seconds"`

	// ChainStart is the hash immediately before the first point, and ChainEnd
	// the hash of the last. Together they pin this range into the device's
	// full chain, so a certificate cannot be built from a cherry-picked subset
	// without the gap being visible.
	ChainStart string `json:"chain_start"`
	ChainEnd   string `json:"chain_end"`

	ChainVerified bool   `json:"chain_verified"`
	ChainDetail   string `json:"chain_detail"`

	Points []CertificatePoint `json:"points"`

	Disclaimer string `json:"disclaimer"`
}

// Certificate is the signed document handed to the user.
type Certificate struct {
	Body      CertificateBody `json:"certificate"`
	Algorithm string          `json:"algorithm"`
	PublicKey string          `json:"public_key"`
	Signature string          `json:"signature"`
}

const disclaimer = "This document attests that the issuing server held exactly these records, " +
	"unmodified, in an unbroken hash chain at the time of issue. Points marked auth=hmac were " +
	"cryptographically signed by a device holding the device secret; points marked auth=secret " +
	"were authenticated with a shared secret sent in cleartext and are correspondingly weaker. " +
	"This is evidence about the recorded data, not proof of the physical location of any vehicle."

// Sign produces a signed certificate from a completed body.
func Sign(body CertificateBody, key KeyPair) (Certificate, error) {
	if len(key.Private) == 0 {
		return Certificate{}, errors.New("no signing key configured")
	}

	body.Version = "gpstracker-cert-v1"
	body.Disclaimer = disclaimer

	payload, err := json.Marshal(body)
	if err != nil {
		return Certificate{}, err
	}

	sig := ed25519.Sign(key.Private, payload)

	return Certificate{
		Body:      body,
		Algorithm: "Ed25519",
		PublicKey: key.PublicKeyHex(),
		Signature: base64.StdEncoding.EncodeToString(sig),
	}, nil
}

// VerifyCertificate checks a certificate against a public key.
//
// Exposed so the CLI (and anyone reimplementing it) can validate a document
// without database access — which is the point of issuing one.
func VerifyCertificate(cert Certificate, publicKeyHex string) (bool, error) {
	pub, err := hex.DecodeString(publicKeyHex)
	if err != nil {
		return false, fmt.Errorf("public key is not valid hex: %w", err)
	}
	if len(pub) != ed25519.PublicKeySize {
		return false, fmt.Errorf("public key must be %d bytes, got %d", ed25519.PublicKeySize, len(pub))
	}

	sig, err := base64.StdEncoding.DecodeString(cert.Signature)
	if err != nil {
		return false, fmt.Errorf("signature is not valid base64: %w", err)
	}

	payload, err := json.Marshal(cert.Body)
	if err != nil {
		return false, err
	}

	return ed25519.Verify(ed25519.PublicKey(pub), payload, sig), nil
}
