"""
seed_benchmark_data.py — fill a THROWAWAY DATA_DIR with the Phase 8
synthetic dataset, for browser and Lighthouse measurements.

    DATA_DIR=/tmp/ma-perf BENCH_FACE_IMAGE=face.jpg python scripts/seed_benchmark_data.py

Refuses to run on a data folder that already has a database. With
BENCH_FACE_IMAGE, that photo is enrolled as one extra person, "Visitor",
so the patient screen has someone to recognise.
"""
import os
import shutil
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config    # noqa: E402
import database  # noqa: E402
from bench_data import seed_database  # noqa: E402


def main():
    if "DATA_DIR" not in os.environ:
        sys.exit("Set DATA_DIR to an empty, throwaway folder.")
    if Path(config.DB_PATH).exists():
        sys.exit(f"{config.DB_PATH} already exists — refusing to add synthetic data to it.")
    database.init_db()
    pids, photos = seed_database()
    face = os.environ.get("BENCH_FACE_IMAGE")
    if face:
        pid = str(uuid.uuid4())
        with database.get_db() as c:
            c.execute("INSERT INTO people (id, name, relationship) VALUES (?, 'Visitor', 'Friend')", (pid,))
            c.executemany("INSERT INTO memories (person_id, summary) VALUES (?, ?)",
                          [(pid, f"A synthetic memory number {i} about a walk in the park.") for i in range(3)])
        (config.KNOWN_FACES_DIR / pid).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(face, config.KNOWN_FACES_DIR / pid / "000.jpg")
    print(f"Seeded {len(pids)} people and {len(photos)} photos into {config.DATA_DIR}")


if __name__ == "__main__":
    main()
