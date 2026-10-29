"""
database.py — SQLite connection and schema.

This is the ONLY module that should ever run raw SQL against the schema
definition itself (CREATE TABLE). Other modules use get_db() to run their
own queries against the tables defined here.
"""
import sqlite3
import config


def get_db():
    """Open a connection to the current DB_PATH. Reads config.DB_PATH at
    call time (not import time) so tests can monkeypatch it per-test."""
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            relationship TEXT, notes TEXT, dob TEXT,
            photo_path TEXT, tts_greeting TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME, duration_s INTEGER DEFAULT 0,
            emotion TEXT, confidence REAL,
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            summary TEXT, raw_transcript TEXT, source TEXT DEFAULT 'manual',
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT,
            message TEXT, seen INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        -- Family photos for reminiscence (separate from the biometric
        -- enrollment photos in known_faces/). Additive: existing tables
        -- are untouched; people.photo_path may point at one of these ids
        -- as the person's chosen profile photo.
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY, filename TEXT NOT NULL,
            caption TEXT, story TEXT, taken_on TEXT,
            memory_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(memory_id) REFERENCES memories(id)
        );
        CREATE TABLE IF NOT EXISTS photo_people (
            photo_id TEXT NOT NULL, person_id TEXT NOT NULL,
            PRIMARY KEY (photo_id, person_id),
            FOREIGN KEY(photo_id) REFERENCES photos(id),
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        """)
    print("✅ Database ready")