#!/usr/bin/env bash
#
# Gets map tiles/styles into place for the tileserver container. Run this ON
# THE SERVER (bootstrap-vps.sh already calls it for you).
#
# config.json, styles/ and fonts/ ship in this repo (maps/) — a few MB, so
# they're committed — and this script seeds MAPS_DIR with them automatically.
# The one thing that can't ship in git is the .mbtiles itself (hundreds of
# MB of vector tile data), so that's the only file you actually need to
# transfer: this script tells you exactly what to scp over from your own
# machine and waits — polling every few seconds — until it shows up, however
# long that takes. Safe to Ctrl+C and re-run later: files already in place
# are detected and left alone.
#
# Usage:
#   ./scripts/prepare-maps.sh                  # MAPS_DIR from .env.prod, else /root/maps
#   ./scripts/prepare-maps.sh /custom/path
#   MAPS_DIR=/custom/path ./scripts/prepare-maps.sh
#
# For copy-pasteable scp commands with the right port/user filled in:
#   SSH_PORT=9011 SSH_USER=root ./scripts/prepare-maps.sh
#
# Want a totally different style/config than the one in this repo? Drop a
# .zip containing config.json, styles/ and fonts/ at its root into MAPS_DIR
# (scp it there same as the .mbtiles) — it's auto-extracted and takes
# precedence over the repo's bundled defaults.
#
# To skip the wait and download the bundled Iran map data instead:
#   AUTO_DOWNLOAD_MAPS=1 ./scripts/prepare-maps.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# shellcheck disable=SC1091
source scripts/lib.sh

MAPS_DIR="${1:-${MAPS_DIR:-}}"
if [[ -z "$MAPS_DIR" && -f .env.prod ]]; then
  load_env .env.prod
fi
MAPS_DIR="${MAPS_DIR:-/root/maps}"

mkdir -p "$MAPS_DIR"

# ---------------------------------------------------------------------- helpers

# A file scp is still writing to has the right name but a size that keeps
# growing. Treating it as "arrived" the moment it appears would hand the
# tileserver a truncated .mbtiles. Only accept a file whose size hasn't
# changed across a short pause.
file_is_stable() {
  local f="$1" s1 s2
  s1="$(stat -c%s "$f" 2>/dev/null)" || return 1
  sleep 2
  s2="$(stat -c%s "$f" 2>/dev/null)" || return 1
  [[ "$s1" == "$s2" && "$s1" != "0" ]]
}

has_maps() {
  local mbtiles
  mbtiles="$(find "$MAPS_DIR" -maxdepth 1 -name "*.mbtiles" -type f 2>/dev/null | head -1)"
  [[ -n "$mbtiles" && -f "$MAPS_DIR/config.json" ]] && file_is_stable "$mbtiles"
}

# A config bundle (config.json + styles/ + fonts/, zipped up) is only needed
# if you want to override the repo's own defaults with a different style —
# extract it the moment it shows up and is done transferring.
unpack_any_zip() {
  local zip
  zip="$(find "$MAPS_DIR" -maxdepth 1 -name "*.zip" -type f 2>/dev/null | head -1)"
  if [[ -n "$zip" ]] && file_is_stable "$zip"; then
    echo "==> Found $(basename "$zip") — extracting into ${MAPS_DIR} (overriding the repo defaults)"
    unzip -o "$zip" -d "$MAPS_DIR" >/dev/null
    rm -f "$zip"
  fi
}

# Seeds MAPS_DIR with the config.json/styles/fonts committed in this repo's
# maps/ directory, unless something is already there (a previous run, an
# uploaded override zip, or a hand-placed file) — never overwrites.
seed_defaults_from_repo() {
  local defaults="${REPO_ROOT}/maps" seeded=0

  if [[ ! -f "$MAPS_DIR/config.json" && -f "$defaults/config.json" ]]; then
    cp "$defaults/config.json" "$MAPS_DIR/config.json"
    seeded=1
  fi
  if [[ ! -d "$MAPS_DIR/styles" && -d "$defaults/styles" ]]; then
    cp -r "$defaults/styles" "$MAPS_DIR/styles"
    seeded=1
  fi
  if [[ ! -d "$MAPS_DIR/fonts" && -d "$defaults/fonts" ]]; then
    cp -r "$defaults/fonts" "$MAPS_DIR/fonts"
    seeded=1
  fi

  if [[ "$seeded" == "1" ]]; then
    echo "==> Seeded ${MAPS_DIR} with this repo's config.json/styles/fonts"
  fi
}

# ------------------------------------------------------------------- already there?
if has_maps; then
  echo "Map data already present in ${MAPS_DIR} — nothing to do."
  find "$MAPS_DIR" -maxdepth 1 -name "*.mbtiles" -type f | head -1
  exit 0
fi

seed_defaults_from_repo

unpack_any_zip
if has_maps; then
  chmod -R a+rX "$MAPS_DIR"
  echo "Map data ready in ${MAPS_DIR}."
  find "$MAPS_DIR" -maxdepth 1 -name "*.mbtiles" -type f | head -1
  exit 0
fi

# --------------------------------------------------------------- auto-download
if [[ "${AUTO_DOWNLOAD_MAPS:-0}" == "1" ]]; then
  MAPS_DOWNLOAD_URL="${MAPS_DOWNLOAD_URL:-https://bucketfirst.s3.ir-thr-at1.arvanstorage.ir/iran-output.zip}"
  echo "==> AUTO_DOWNLOAD_MAPS=1 — downloading the bundled Iran map data instead"
  MAPS_ZIP="${MAPS_DIR}/maps.zip"
  curl -fL --progress-bar -o "$MAPS_ZIP" "$MAPS_DOWNLOAD_URL"
  unzip -o "$MAPS_ZIP" -d "$MAPS_DIR" >/dev/null
  rm -f "$MAPS_ZIP"
  chmod -R a+rX "$MAPS_DIR"
  if has_maps; then
    echo "Done."
    exit 0
  fi
  echo "Warning: downloaded, but no .mbtiles + config.json found afterward." >&2
  exit 1
fi

# --------------------------------------------------------------- wait for scp
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org || echo "<this-server-ip>")"
SSH_PORT="${SSH_PORT:-22}"
SSH_USER="${SSH_USER:-root}"

echo ""
echo "================================================================"
echo " Missing: a .mbtiles file in ${MAPS_DIR}"
echo "================================================================"
echo ""
echo "config.json/styles/fonts are already in place (from this repo's"
echo "maps/ directory) — only the tile data itself is left. From your OWN"
echo "machine:"
echo ""
echo "  scp -P ${SSH_PORT} your-tiles.mbtiles ${SSH_USER}@${SERVER_IP}:${MAPS_DIR}/"
echo ""
if [[ "$SSH_PORT" == "22" || "$SSH_USER" == "root" ]]; then
  echo "  (guessed port/user — if that's not how you reach this server, re-run"
  echo "  with SSH_PORT=... SSH_USER=... ./scripts/prepare-maps.sh for exact commands)"
  echo ""
fi
echo "The filename can be anything ending in .mbtiles, as long as config.json's"
echo "data.*.mbtiles entry names it (the repo default expects iran-output.mbtiles)."
echo ""
echo "Waiting (Ctrl+C to stop; just re-run this script later to pick up where"
echo "you left off) ..."
echo ""

waited=0
while ! has_maps; do
  unpack_any_zip
  has_maps && break
  sleep 5
  waited=$((waited + 5))
  if (( waited % 60 == 0 )); then
    echo "    ...still waiting for a .mbtiles in ${MAPS_DIR}"
  fi
done

chmod -R a+rX "$MAPS_DIR"
echo ""
echo "Found it: $(find "$MAPS_DIR" -maxdepth 1 -name "*.mbtiles" -type f | head -1)"
echo "Map data ready in ${MAPS_DIR}."
