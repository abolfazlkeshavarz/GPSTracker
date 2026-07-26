#!/bin/bash

# ============================================================
# Simple Restore Script for New Server
# Usage: sudo bash restore.sh /path/to/backup.sql.gz
# Example: sudo bash restore.sh /tmp/tracking_db_backup_20241201_120000.sql.gz
# ============================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DB_NAME="tracking_db"

# Check if backup file was provided
if [ -z "$1" ]; then
    error "Usage: $0 /path/to/backup.sql.gz"
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not found: ${BACKUP_FILE}"
fi

log "Found backup: ${BACKUP_FILE}"
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup size: ${SIZE}"

# Verify backup integrity
log "Verifying backup integrity..."
if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "✅ Backup is valid"
else
    error "Backup file is corrupted!"
fi

# Stop backend service if running
log "Stopping backend service..."
systemctl stop tracking-backend 2>/dev/null && log "✅ Backend stopped" || warn "Backend not running"

# Reset database (drop and recreate)
log "Resetting database..."
sudo -u postgres psql -d postgres <<SQL
-- Terminate all connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();

-- Drop and recreate database
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
SQL

if [ $? -eq 0 ]; then
    log "✅ Database reset successfully"
else
    error "Failed to reset database"
fi

# Restore from backup
log "Restoring database..."
if sudo -u postgres bash -c "gunzip -c ${BACKUP_FILE} | psql -d ${DB_NAME} 2>&1"; then
    log "✅ Database restore completed"
else
    error "Restore failed"
fi

# Verify restore
log "Verifying restore..."
USER_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
DEVICE_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM devices;" 2>/dev/null | xargs)

log "✅ Users restored: ${USER_COUNT:-0}"
log "✅ Devices restored: ${DEVICE_COUNT:-0}"

# Show sample of restored data
log "Sample users:"
sudo -u postgres psql -d "$DB_NAME" -c "SELECT phone, role FROM users LIMIT 5;"

# Start backend service
log "Starting backend service..."
systemctl start tracking-backend 2>/dev/null && log "✅ Backend started" || warn "Backend service not found"

log ""
log "=========================================="
log "✅ RESTORE COMPLETE"
log "=========================================="
log "Database: ${DB_NAME}"
log "Users: ${USER_COUNT:-0}"
log "Devices: ${DEVICE_COUNT:-0}"
log ""
log "To verify:"
log "  sudo -u postgres psql -d ${DB_NAME} -c 'SELECT COUNT(*) FROM users;'"
log "=========================================="
