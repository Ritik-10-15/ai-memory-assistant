#!/bin/bash
# Release a version of the private app and roll back if it is not healthy.
#
#   sudo bash aws/deploy.sh [GIT_REF]          # default: origin/main
#
# Steps: build an image tagged with the commit → back up the data (with the
# new image, while the old version keeps serving) → start the new version →
# wait for /readyz to report it ready and running that commit → otherwise
# start the previous commit's image again. Data is never deleted; a failed
# release leaves the pre-release backup in $BACKUP_DIR.
#
# Settings (environment): COMPOSE_FILE (default docker-compose.aws.yml),
# BACKUP_DIR (default /var/backups/memory-assistant), READY_TIMEOUT seconds.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.aws.yml}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/memory-assistant}
READY_TIMEOUT=${READY_TIMEOUT:-180}
REF=${1:-origin/main}
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

ready() {   # $1 = expected version
  compose exec -T app python -c "
import json, sys, urllib.request
try:
    body = json.load(urllib.request.urlopen('http://localhost:8000/readyz', timeout=5))
except Exception:
    sys.exit(1)
sys.exit(0 if body.get('status') == 'ready' and body.get('version') == '$1' else 1)" 2>/dev/null
}

wait_ready() {
  local deadline=$((SECONDS + READY_TIMEOUT))
  while [ $SECONDS -lt $deadline ]; do
    if ready "$1"; then return 0; fi
    sleep 5
  done
  return 1
}

running_version() {   # what is actually serving now, whatever git's checkout says
  compose exec -T app python -c "
import json, urllib.request
print(json.load(urllib.request.urlopen('http://localhost:8000/readyz', timeout=5))['version'])" 2>/dev/null
}

PREV=$(running_version || true)
if [ -z "$PREV" ] || [ "$PREV" = "dev" ] || ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  PREV=$(git rev-parse --short HEAD)    # nothing running, or an image from before version tags
fi
git fetch -q origin
git checkout -q --detach "$REF"
NEW=$(git rev-parse --short HEAD)
echo "Releasing $NEW (running: $PREV)"

export APP_VERSION=$NEW
compose build app

mkdir -p "$BACKUP_DIR" && chown 10001:10001 "$BACKUP_DIR" 2>/dev/null || true
echo "Backing up data before the release"
compose run --rm --no-deps -v "$BACKUP_DIR:/backups" app python scripts/backup.py create /backups \
  || echo "No backup made (fresh install or no database yet)"

compose up -d
if wait_ready "$NEW"; then
  echo "Release $NEW is healthy"
  exit 0
fi

echo "Release $NEW did not become ready within ${READY_TIMEOUT}s; rolling back to $PREV" >&2
compose logs --tail 50 app >&2 || true
git checkout -q --detach "$PREV"
export APP_VERSION=$PREV
if docker image inspect "memory-assistant:$PREV" >/dev/null 2>&1; then
  compose up -d
else
  compose up -d --build          # the previous version predates per-commit image tags
fi
if wait_ready "$PREV"; then
  echo "Rolled back to $PREV" >&2
else
  echo "Rollback to $PREV is not ready either: check 'docker compose logs app'" >&2
fi
exit 1
