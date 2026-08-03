package utils

import (
    "errors"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID int `json:"user_id"`
    jwt.RegisteredClaims
}

// signingMethod is pinned on both sign and verify so a token cannot be
// presented with a different alg than the one we issue.
const signingAlg = "HS256"

func GenerateJWT(userID int, secret []byte, expiryHours int) (string, error) {
    if len(secret) == 0 {
        return "", errors.New("jwt secret is not configured")
    }
    if expiryHours <= 0 {
        return "", errors.New("jwt expiry must be positive")
    }

    now := time.Now()

    claims := Claims{
        UserID: userID,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(expiryHours) * time.Hour)),
            IssuedAt:  jwt.NewNumericDate(now),
            NotBefore: jwt.NewNumericDate(now),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(secret)
}

func ValidateJWT(tokenString string, secret []byte) (*Claims, error) {
    if len(secret) == 0 {
        return nil, errors.New("jwt secret is not configured")
    }

    token, err := jwt.ParseWithClaims(
        tokenString,
        &Claims{},
        func(token *jwt.Token) (interface{}, error) {
            // Belt and braces alongside WithValidMethods: never hand the HMAC
            // secret to a non-HMAC verifier.
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, errors.New("unexpected signing method")
            }
            return secret, nil
        },
        jwt.WithValidMethods([]string{signingAlg}),
        jwt.WithExpirationRequired(),
    )

    if err != nil {
        return nil, err
    }

    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, errors.New("invalid token")
    }

    if claims.UserID <= 0 {
        return nil, errors.New("token missing user id")
    }

    return claims, nil
}