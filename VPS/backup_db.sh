#!/bin/bash

# ============================================================
# Simple Backup Script for Old Server
# Usage: sudo bash backup.sh
# ============================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DB_NAME="tracking_db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"

log "Creating backup of database '${DB_NAME}'..."

# Change to /tmp directory to avoid permission issues
cd /tmp

# Create backup
if sudo -u postgres bash -c "pg_dump ${DB_NAME} 2>/dev/null | gzip > ${BACKUP_FILE}"; then
    if [ -f "$BACKUP_FILE" ]; then
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "✅ Backup created successfully!"
        log "📁 Location: ${BACKUP_FILE}"
        log "📦 Size: ${SIZE}"
        
        # Show database stats
        USER_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
        DEVICE_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM devices;" 2>/dev/null | xargs)
        log "📊 Database has ${USER_COUNT:-0} users and ${DEVICE_COUNT:-0} devices"
    else
        error "Backup file not created"
    fi
else
    error "Backup failed"
fi

# Verify backup
log "Verifying backup integrity..."
if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "✅ Backup integrity verified"
else
    error "Backup file is corrupted!"
fi

log ""
log "=========================================="
log "✅ BACKUP COMPLETE"
log "=========================================="
log "Backup file: ${BACKUP_FILE}"
log ""
log "Next step: Copy this file to new server:"
log "  scp ${BACKUP_FILE} root@NEW_SERVER_IP:/tmp/"
log "=========================================="