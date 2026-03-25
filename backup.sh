#!/bin/bash
# Eastside CRM Backup Script
# Run: bash backup.sh
# Creates a timestamped backup in the backups/ folder

set -e

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="eastside-crm-backup-${TIMESTAMP}"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: ${BACKUP_NAME}.tar.gz ..."

tar czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
  --exclude='node_modules' \
  --exclude='.parcel-cache' \
  --exclude='dist' \
  --exclude='backups' \
  --exclude='.git' \
  .

SIZE=$(ls -lh "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | awk '{print $5}')
echo "Backup complete: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz (${SIZE})"

# Keep only last 10 backups
cd "$BACKUP_DIR"
ls -t eastside-crm-backup-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm --
echo "Cleaned old backups (keeping last 10)"
