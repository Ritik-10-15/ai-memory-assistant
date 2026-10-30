"""
backup.py — back up and restore everything the app stores under DATA_DIR.

    python scripts/backup.py create BACKUP_DIR      # safe while the app runs
    python scripts/backup.py verify ARCHIVE
    python scripts/backup.py restore ARCHIVE [--force]   # stop the app first

An archive (memory-assistant-<UTC time>.tar.gz) holds a consistent copy of
the SQLite database (SQLite's online backup, so the app can keep running),
the enrolled face photos, family photos and pending voice-memo uploads, and
a manifest with record counts and a SHA-256 for every file. The embedding
cache is left out: it is rebuilt from the face photos on start-up.

Restore checks every file against the manifest first. It refuses to touch a
data folder that already has a database unless --force is given, and even
then moves the existing data into DATA_DIR/pre-restore-<time>/ rather than
deleting it.

In Docker:  docker compose run --rm -v "$PWD/backups:/backups" app \
                python scripts/backup.py create /backups
"""
import argparse
import hashlib
import io
import json
import shutil
import sqlite3
import sys
import tarfile
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402

FOLDERS = ("known_faces", "photos", "uploads")
COUNTED = ("people", "memories", "visits", "photos", "albums")


def _db_name():
    return Path(config.DB_PATH).name


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _counts(db_path):
    conn = sqlite3.connect(db_path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        out = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in COUNTED if t in tables}
        out["schema_version"] = conn.execute("PRAGMA user_version").fetchone()[0]
        return out
    finally:
        conn.close()


def create(dest_dir, data_dir=None):
    data = Path(data_dir or config.DATA_DIR)
    db = data / _db_name()
    if not db.exists():
        raise SystemExit(f"No database at {db}: nothing to back up.")
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    archive = dest / f"memory-assistant-{stamp}.tar.gz"
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / _db_name()
        src, dst = sqlite3.connect(db), sqlite3.connect(snapshot)
        try:
            src.backup(dst)                       # consistent even while the app writes
        finally:
            dst.close()
            src.close()
        files = {_db_name(): snapshot}
        for folder in FOLDERS:
            root = data / folder
            if root.is_dir():
                for f in sorted(p for p in root.rglob("*") if p.is_file()):
                    files[f.relative_to(data).as_posix()] = f
        manifest = {
            "format": 1,
            "created_utc": stamp,
            "app_version": config.APP_VERSION,
            "counts": _counts(snapshot),
            "files": {name: {"sha256": _sha256(p), "bytes": p.stat().st_size} for name, p in files.items()},
        }
        tmp_archive = archive.with_suffix(".partial")
        with tarfile.open(tmp_archive, "w:gz") as tar:
            body = json.dumps(manifest, indent=1).encode()
            info = tarfile.TarInfo("manifest.json")
            info.size = len(body)
            info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(body))
            for name, path in files.items():
                tar.add(path, arcname=f"data/{name}")
        tmp_archive.replace(archive)
    print(f"Backup written: {archive}")
    print(f"  {len(files)} files · " + ", ".join(f"{k} {v}" for k, v in manifest["counts"].items()))
    return archive


def _read(archive):
    tar = tarfile.open(archive, "r:gz")
    manifest = json.load(tar.extractfile("manifest.json"))
    return tar, manifest


def verify(archive):
    """Every file listed is present with the recorded checksum, and nothing else."""
    tar, manifest = _read(archive)
    with tar:
        names = {m.name[len("data/"):]: m for m in tar.getmembers() if m.isfile() and m.name.startswith("data/")}
        problems = sorted(set(manifest["files"]) ^ set(names))
        for name, meta in manifest["files"].items():
            if name in names:
                h = hashlib.sha256(tar.extractfile(names[name]).read()).hexdigest()
                if h != meta["sha256"]:
                    problems.append(f"checksum mismatch: {name}")
    if problems:
        raise SystemExit("Backup is damaged or incomplete:\n  " + "\n  ".join(problems))
    print(f"Backup OK: {len(manifest['files'])} files, created {manifest['created_utc']} UTC, "
          + ", ".join(f"{k} {v}" for k, v in manifest["counts"].items()))
    return manifest


def restore(archive, data_dir=None, force=False):
    manifest = verify(archive)
    data = Path(data_dir or config.DATA_DIR)
    data.mkdir(parents=True, exist_ok=True)
    existing = [p for p in [data / _db_name(), *(data / f for f in FOLDERS), data / "gallery_cache.npz"] if p.exists()]
    if (data / _db_name()).exists() and not force:
        raise SystemExit(f"{data / _db_name()} already exists. Stop the app, then re-run with --force: the current "
                         "data will be moved to a pre-restore folder, not deleted.")
    if existing:
        aside = data / f"pre-restore-{time.strftime('%Y%m%d-%H%M%S', time.gmtime())}"
        aside.mkdir()
        for p in existing:
            shutil.move(str(p), str(aside / p.name))
        for extra in data.glob(f"{_db_name()}-*"):           # WAL / shared-memory files
            shutil.move(str(extra), str(aside / extra.name))
        print(f"Existing data moved to {aside}")
    with tarfile.open(archive, "r:gz") as tar:
        members = [m for m in tar.getmembers() if m.isfile() and m.name.startswith("data/")]
        for m in members:
            m.name = m.name[len("data/"):]
        tar.extractall(data, members=members, filter="data")   # "data" filter: no paths outside DATA_DIR
    counts = _counts(data / _db_name())
    if {k: v for k, v in counts.items()} != manifest["counts"]:
        raise SystemExit(f"Restored database does not match the manifest: {counts} vs {manifest['counts']}")
    print(f"Restored into {data}: " + ", ".join(f"{k} {v}" for k, v in counts.items()))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("create").add_argument("dest")
    sub.add_parser("verify").add_argument("archive")
    r = sub.add_parser("restore")
    r.add_argument("archive")
    r.add_argument("--force", action="store_true", help="move existing data aside and restore anyway")
    a = ap.parse_args()
    if a.cmd == "create":
        create(a.dest)
    elif a.cmd == "verify":
        verify(a.archive)
    else:
        restore(a.archive, force=a.force)


if __name__ == "__main__":
    main()
