# Backend image: build with the Go toolchain, ship a static binary on a
# minimal base. The runtime layer has no compiler, no shell tooling and no
# source, so the attack surface is the binary plus CA certificates.

# ---------------------------------------------------------------- build
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies first: this layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 produces a fully static binary that runs on a scratch-like
# base. -trimpath keeps build paths out of the artifact; -s -w drop the
# symbol table and DWARF data.
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags="-s -w -X main.version=${VERSION}" \
        -o /out/server ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/cli ./cmd/cli

# Run the tests in the image build so a broken commit cannot produce an image.
RUN go vet ./... && go test ./...

# -------------------------------------------------------------- runtime
FROM alpine:3.21

# ca-certificates for outbound TLS; tzdata so timestamps render in the
# configured zone rather than UTC only.
RUN apk add --no-cache ca-certificates tzdata wget \
 && addgroup -g 10001 -S app \
 && adduser -u 10001 -S -G app app

WORKDIR /app

COPY --from=build /out/server /app/server
COPY --from=build /out/cli /app/cli
# Shipped so `docker compose exec` can apply or inspect the schema.
COPY --from=build /src/scripts /app/scripts

# Never run as root.
USER app:app

EXPOSE 8080

ENV GIN_MODE=release \
    SERVER_PORT=8080

# Uses the app's own /health route, so the check fails if the HTTP server is
# wedged even while the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/app/server"]
