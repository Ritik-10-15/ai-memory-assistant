"""
bench_data.py — the synthetic dataset used by every Phase 8 benchmark, so
backend, browser and Lighthouse measurements all see the same workload.

Only ever call these against a throwaway DATA_DIR / DB_PATH: they insert
fictional people, memories, visits, albums and blank gradient photos.
"""
import random
import uuid

import cv2
import numpy as np

import config
import database

PEOPLE, MEMORIES_PER_PERSON, VISITS, ALBUMS, PHOTOS_PER_ALBUM = 30, 50, 20_000, 12, 30


def gallery_of(people, per_person, rng, extra=None):
    """Random 128-d embeddings (cost, not accuracy) plus optional real ones."""
    g = {f"synthetic-{i:04d}": [rng.normal(size=(1, 128)).astype(np.float32) for _ in range(per_person)]
         for i in range(people)}
    if extra:
        g.update(extra)
    return g


def _gradient_jpeg(w, h, quality):
    img = np.tile(np.linspace(40, 220, w, dtype=np.uint8), (h, 1))[..., None].repeat(3, 2)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])[1].tobytes()


def seed_database(people=PEOPLE, memories_per=MEMORIES_PER_PERSON, visits=VISITS,
                  albums=ALBUMS, photos_per_album=PHOTOS_PER_ALBUM):
    """A representative family: ~3 years of visits and memories, a dozen
    albums (the last one hidden from the patient). Returns (person ids, photo ids)."""
    rnd = random.Random(7)
    pids = [str(uuid.uuid4()) for _ in range(people)]
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    full, thumb = _gradient_jpeg(1600, 1200, 85), _gradient_jpeg(480, 360, 80)
    with database.get_db() as c:
        c.executemany("INSERT INTO people (id, name, relationship, notes) VALUES (?,?,?,?)",
                      [(p, f"Person {i}", "Friend", "Synthetic notes " * 5) for i, p in enumerate(pids)])
        c.executemany("INSERT INTO memories (person_id, summary, created_at) VALUES (?,?,datetime('now', ?))",
                      [(p, "A synthetic memory about a day out. " * 3, f"-{rnd.randint(0, 1000)} days")
                       for p in pids for _ in range(memories_per)])
        c.executemany("INSERT INTO visits (person_id, started_at, ended_at, duration_s, confidence) "
                      "VALUES (?, datetime('now', ?), datetime('now', ?), 600, 0.7)",
                      [(rnd.choice(pids), f"-{k} minutes", f"-{k - 10} minutes") for k in
                       sorted(rnd.sample(range(20, 1_500_000), visits), reverse=True)])
        photo_ids = []
        for a in range(albums):
            aid = uuid.uuid4().hex
            c.execute("INSERT INTO albums (id, title, visible_to_patient) VALUES (?,?,?)",
                      (aid, f"Album {a}", 0 if a == albums - 1 else 1))
            for k in range(photos_per_album):
                ph = uuid.uuid4().hex
                photo_ids.append(ph)
                (config.PHOTOS_DIR / f"{ph}.jpg").write_bytes(full)
                (config.PHOTOS_DIR / f"{ph}_thumb.jpg").write_bytes(thumb)
                c.execute("INSERT INTO photos (id, filename, caption, story) VALUES (?,?,?,?)",
                          (ph, f"{ph}.jpg", "A synthetic caption", "A synthetic story. " * 4))
                c.execute("INSERT INTO album_photos (album_id, photo_id, position) VALUES (?,?,?)", (aid, ph, k))
                c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)",
                              [(ph, p) for p in rnd.sample(pids, 2)])
    return pids, photo_ids


def add_visits(n):
    rnd = random.Random(11)
    with database.get_db() as c:
        pids = [r[0] for r in c.execute("SELECT id FROM people")]
        c.executemany("INSERT INTO visits (person_id, started_at, ended_at, duration_s) "
                      "VALUES (?, datetime('now', ?), datetime('now', ?), 300)",
                      [(rnd.choice(pids), f"-{k} minutes", f"-{k} minutes") for k in range(n)])
