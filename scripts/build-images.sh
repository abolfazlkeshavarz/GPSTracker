#!/usr/bin/env bash
#
# Builds the two images that must be compiled — backend and frontend — HERE
# (a development machine) and packs them into a single tarball to carry to
# the server, so the server never has to build anything.
#
# Why this exists: the frontend's Vite/TypeScript build (plus the PWA
# service-worker bundling) and the Go build both want real CPU and RAM; on a
# small VPS (1 core, 1 GB) building in place is slow at best and gets
# OOM-killed at worst. Build where the resources are and ship the result.
#
# postgres/redis/mosquitto/tileserver are pulled from Docker Hub as-is on the
# server — only the two images this project owns need building.
#
# Usage (on your own machine, from the project root):
#   ./scripts/build-images.sh
#   make images-bundle
#
# Options (environment variables):
#   PLATFORM=linux/arm64          target architecture, if the server is not x86-64
#   VERSION=1.2.0                 image tag (default: latest, matches `make images`)
#   OUT=path/to/file.tar.gz       where to write the bundle
set -euo pipefail

cd "$(dirname "$0")/.."

PLATFORM="${PLATFORM:-linux/amd64}"
VERSION="${VERSION:-latest}"
OUT="${OUT:-dist/gpstracker-images.tar.gz}"

IMAGES=("gpstracker-backend:${VERSION}" "gpstracker-frontend:${VERSION}")

echo "==> Building images for ${PLATFORM}"
echo ""

DOCKER_DEFAULT_PLATFORM="$PLATFORM" docker build \
  -t "gpstracker-backend:${VERSION}" \
  --build-arg "VERSION=${VERSION}" \
  ./tracking-backend

DOCKER_DEFAULT_PLATFORM="$PLATFORM" docker build \
  -t "gpstracker-frontend:${VERSION}" \
  ./tracking-frontend

echo ""
echo "==> Verifying the built images really are ${PLATFORM}"
# A mismatch here does not fail the build; it produces images that load fine
# on the server and then die at startup with a bare "exec format error" — a
# confusing symptom to debug remotely. Cheaper to catch it now.
want_os="${PLATFORM%%/*}"
want_arch="${PLATFORM##*/}"
for img in "${IMAGES[@]}"; do
  got="$(docker image inspect "$img" --format '{{.Os}}/{{.Architecture}}')"
  if [[ "$got" != "${want_os}/${want_arch}" ]]; then
    echo "Error: ${img} is ${got}, but ${PLATFORM} was requested." >&2
    echo "       Loading this on the server would fail at runtime with" >&2
    echo "       \"exec format error\". Check your Docker buildx setup." >&2
    exit 1
  fi
  echo "    ${img}: ${got}"
done

echo ""
echo "==> Packing into ${OUT}"
mkdir -p "$(dirname "$OUT")"
# gzip -1: image layers are mostly already-compressed content, so the higher
# levels cost a lot of time for very little extra saving.
docker save "${IMAGES[@]}" | gzip -1 > "$OUT"

size="$(du -h "$OUT" | cut -f1)"
echo ""
echo "================================================================"
echo " Built: ${size}  ->  ${OUT}"
echo "================================================================"
echo ""
echo "Next, copy it to the server and load it there:"
echo ""
echo "  scp ${OUT} YOUR_USER@YOUR_SERVER:/opt/gpstracker/"
echo "  ssh YOUR_USER@YOUR_SERVER"
echo "  cd /opt/gpstracker && ./scripts/load-images.sh"
echo ""
echo "This bundle contains only the two images that must be built. postgres,"
echo "redis, mosquitto and tileserver are pulled from Docker Hub on the"
echo "server — very likely already cached there if another project uses them."
