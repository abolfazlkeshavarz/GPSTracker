package utils

import (
    "os"

    "github.com/rs/zerolog"
)

var Logger zerolog.Logger

func InitLogger() {

    Logger = zerolog.New(os.Stdout).
        With().
        Timestamp().
        Logger()
}
