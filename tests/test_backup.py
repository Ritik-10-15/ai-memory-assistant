"""
Backup and restore (Phase 9), on an isolated sample data folder: a
restored folder must hold the same records and byte-identical media, and a
restore must never silently replace existing data.
"""
import sys
import tarfile
from pathlib import Path

import pytest

import config
import database

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import backup  # noqa: E402


@pytest.fixture
def data(tmp_path, monkeypatch):
    """A self-contained DATA_DIR with sample records, faces, photos and an upload."""
    d = tmp_path / "data"
    d.mkdir()
    monkeypatch.setattr(config, "DB_PATH", str(d / "memory_v2.db"))
    database.init_db()
    with database.get_db() as c:
        c.execute("INSERT INTO people (id, name) VALUES ('p1', 'Sample Person')")
        c.execute("INSERT INTO memories (person_id, summary) VALUES ('p1', 'A sample memory')")
        c.execute("INSERT INTO visits (person_id) VALUES ('p1')")
        c.execute("INSERT INTO photos (id, filename) VALUES ('a' || hex(randomblob(15)), 'x.jpg')")
    for rel, body in {"known_faces/p1/000.jpg": b"face-bytes", "photos/abc.jpg": b"photo-bytes",
                      "photos/abc_thumb.jpg": b"thumb", "uploads/memo.webm": b"audio"}.items():
        (d / rel).parent.mkdir(parents=True, exist_ok=True)
        (d / rel).write_bytes(body)
    (d / "gallery_cache.npz").write_bytes(b"derived")      # rebuilt on start-up, not backed up
    return d


def _tree(d):
    return {p.relative_to(d).as_posix(): p.read_bytes() for p in d.rglob("*")
            if p.is_file() and p.parts[len(d.parts)] in ("known_faces", "photos", "uploads")}


def test_a_backup_restores_every_record_and_file(data, tmp_path, monkeypatch):
    archive = backup.create(tmp_path / "backups", data_dir=data)
    manifest = backup.verify(archive)
    assert manifest["counts"]["people"] == 1 and manifest["counts"]["memories"] == 1
    assert "gallery_cache.npz" not in manifest["files"]

    fresh = tmp_path / "restored"
    monkeypatch.setattr(config, "DB_PATH", str(fresh / "memory_v2.db"))
    backup.restore(archive, data_dir=fresh)
    assert _tree(fresh) == _tree(data)
    with database.get_db() as c:
        assert c.execute("SELECT name FROM people").fetchone()[0] == "Sample Person"
        assert c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_restore_never_overwrites_existing_data_without_force(data, tmp_path):
    archive = backup.create(tmp_path / "backups", data_dir=data)
    with pytest.raises(SystemExit, match="already exists"):
        backup.restore(archive, data_dir=data)
    with database.get_db() as c:                              # untouched
        assert c.execute("SELECT COUNT(*) FROM people").fetchone()[0] == 1


def test_a_forced_restore_moves_the_current_data_aside(data, tmp_path):
    archive = backup.create(tmp_path / "backups", data_dir=data)
    with database.get_db() as c:
        c.execute("INSERT INTO people (id, name) VALUES ('p2', 'Added after the backup')")
    del c                                    # the app is stopped before a restore
    import gc
    gc.collect()
    backup.restore(archive, data_dir=data, force=True)
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM people").fetchone()[0] == 1
    aside = next(data.glob("pre-restore-*"))
    import sqlite3
    old = sqlite3.connect(aside / "memory_v2.db")
    assert old.execute("SELECT COUNT(*) FROM people").fetchone()[0] == 2     # kept, not deleted
    old.close()


def test_a_damaged_backup_is_rejected_before_anything_is_restored(data, tmp_path):
    archive = backup.create(tmp_path / "backups", data_dir=data)
    bad = tmp_path / "bad.tar.gz"
    with tarfile.open(archive, "r:gz") as src, tarfile.open(bad, "w:gz") as dst:
        for m in src.getmembers():
            f = src.extractfile(m) if m.isfile() else None
            if m.name == "data/photos/abc.jpg":
                import io
                body = b"tampered"
                m.size = len(body)
                f = io.BytesIO(body)
            dst.addfile(m, f)
    target = tmp_path / "target"
    with pytest.raises(SystemExit, match="checksum mismatch"):
        backup.restore(bad, data_dir=target)
    assert not (target / "memory_v2.db").exists()
