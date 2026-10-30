#!/bin/sh
# Container entry point: make sure the data volume belongs to the
# unprivileged "app" user (volumes created by older images are owned by
# root), then run the command as that user. Nothing in /data is modified
# other than its ownership.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  if [ "$(stat -c %u "${DATA_DIR:-/data}")" != "10001" ] || \
     find "${DATA_DIR:-/data}" ! -user 10001 -print -quit | grep -q .; then
    chown -R app:app "${DATA_DIR:-/data}"
  fi
  export HOME=/home/app
  exec setpriv --reuid=app --regid=app --init-groups -- "$@"
fi
exec "$@"
