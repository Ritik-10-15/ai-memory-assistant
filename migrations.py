"""
migrations.py — numbered, additive schema migrations.

database.init_db() creates the original tables (schema version 0); this
module upgrades from there. The version lives in SQLite's own
`PRAGMA user_version`, so no extra bookkeeping table is needed.

Upgrade:   automatic on startup (init_db) or `python scripts/db_migrate.py up`.
           Before the first migration of an existing database a full copy is
           written next to it (memory_v2.db.bak-v<from>), and every migration
           runs in one transaction — it either fully applies or not at all.
Rollback:  restore that copy, or `python scripts/db_migrate.py down <version>`,
           which removes ONLY what the migrations added (new tables, indexes
           and columns). Existing people, visits, memories and photos are never
           modified or deleted by either direction.
"""
import sqlite3
from pathlib import Path

import config


def _columns(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


# ── 1: photo albums ───────────────────────────────────────────────────
def _up_1(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
            visible_to_patient INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS album_photos (
            album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (album_id, photo_id)
        )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_album_photos_order ON album_photos(album_id, position)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photo_people_person ON photo_people(person_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_memory ON photos(memory_id)")
    have = _columns(conn, "photos")
    for name, decl in PHOTO_COLUMNS_1:
        if name not in have:
            conn.execute(f"ALTER TABLE photos ADD COLUMN {name} {decl}")


PHOTO_COLUMNS_1 = [
    ("location", "TEXT NOT NULL DEFAULT ''"),
    ("category", "TEXT NOT NULL DEFAULT ''"),
    ("prompt", "TEXT NOT NULL DEFAULT ''"),
    ("width", "INTEGER"),
    ("height", "INTEGER"),
]


def _down_1(conn):
    conn.execute("DROP TABLE IF EXISTS album_photos")
    conn.execute("DROP TABLE IF EXISTS albums")
    for idx in ("idx_album_photos_order", "idx_album_photos_photo", "idx_photo_people_person", "idx_photos_memory"):
        conn.execute(f"DROP INDEX IF EXISTS {idx}")
    have = _columns(conn, "photos")
    for name, _ in PHOTO_COLUMNS_1:
        if name in have:
            conn.execute(f"ALTER TABLE photos DROP COLUMN {name}")   # SQLite ≥ 3.35


MIGRATIONS = {1: (_up_1, _down_1)}
LATEST = max(MIGRATIONS)


def _connect(path):
    # Autocommit mode so BEGIN/COMMIT below are the only transaction control.
    conn = sqlite3.connect(path, isolation_level=None)
    conn.execute("PRAGMA foreign_keys=OFF")   # schema changes; data untouched
    return conn


def current_version(path=None):
    conn = sqlite3.connect(path or config.DB_PATH)
    try:
        return conn.execute("PRAGMA user_version").fetchone()[0]
    finally:
        conn.close()


def backup(path, version):
    """Full, consistent copy of the database (works while it is open)."""
    dest = Path(f"{path}.bak-v{version}")
    src, dst = sqlite3.connect(path), sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return dest


def upgrade(path=None, target=LATEST, make_backup=True):
    path = path or config.DB_PATH
    version = current_version(path)
    if version >= target:
        return version
    if make_backup:
        print(f"💾 Database backup before migrating: {backup(path, version)}")
    conn = _connect(path)
    try:
        for v in range(version + 1, target + 1):
            conn.execute("BEGIN")
            try:
                MIGRATIONS[v][0](conn)
                conn.execute(f"PRAGMA user_version={v}")
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            print(f"✅ Database migrated to version {v}")
    finally:
        conn.close()
    return target


def downgrade(path=None, target=0):
    path = path or config.DB_PATH
    version = current_version(path)
    conn = _connect(path)
    try:
        for v in range(version, target, -1):
            conn.execute("BEGIN")
            try:
                MIGRATIONS[v][1](conn)
                conn.execute(f"PRAGMA user_version={v - 1}")
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            print(f"↩️  Database rolled back to version {v - 1}")
    finally:
        conn.close()
    return min(version, target)
