"""
db_migrate.py — inspect, upgrade or roll back the database schema.

    python scripts/db_migrate.py status
    python scripts/db_migrate.py up                # to the latest version (backs up first)
    python scripts/db_migrate.py down 0            # roll back to version 0

Stop the app first. Uses DATA_DIR like the app does (in Docker:
docker compose -f docker-compose.aws.yml exec app python scripts/db_migrate.py status).
Rolling back removes only what migrations added (album tables and the new
photo columns); people, visits, memories and photos are kept. The app
upgrades again automatically on its next start, so to stay on an older
version also run the matching older code.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config      # noqa: E402
import database    # noqa: E402
import migrations  # noqa: E402


def main(argv):
    if not os.path.exists(config.DB_PATH):
        sys.exit(f"No database at {config.DB_PATH}")
    cmd = argv[1] if len(argv) > 1 else "status"
    if cmd == "status":
        print(f"{config.DB_PATH}: schema version {migrations.current_version()} (latest {migrations.LATEST})")
    elif cmd == "up":
        # Same path as app startup: creates any base tables an old database
        # predates (e.g. photos), then applies the numbered migrations.
        database.init_db()
    elif cmd == "down" and len(argv) == 3 and argv[2].isdigit():
        version = migrations.current_version()
        print(f"💾 Backup: {migrations.backup(config.DB_PATH, version)}")
        migrations.downgrade(target=int(argv[2]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
