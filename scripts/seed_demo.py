"""
seed_demo.py — load clearly labelled DEMO records for showing the app.

    python scripts/seed_demo.py            # add demo people, memories, photos
    python scripts/seed_demo.py --remove   # delete everything this script added

Every demo person's name ends in "(demo)" and their description says it is
demo data, so it can never be mistaken for a real family. The photos are
synthetic scenery images (frontend/e2e/fixtures) — no real people's faces —
and no faces are enrolled, so demo people are never "recognised" on camera.
Run it against the same DATA_DIR as the app (inside Docker:
`docker compose exec app python scripts/seed_demo.py`).
"""
import argparse
import shutil
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import config  # noqa: E402
from database import get_db, init_db  # noqa: E402

FIXTURES = ROOT / "frontend" / "e2e" / "fixtures"
MARK = "(demo)"
NOTE = "Demo profile — sample data for showing the app."

PEOPLE = [
    ("Sarah Johnson", "Daughter", "Lives in Leeds with her two boys. Loves gardening."),
    ("John Smith", "Neighbour", "Lives next door and brings the newspaper on Sundays."),
    ("Priya Patel", "Carer", "Visits on weekday mornings. Enjoys a good crossword."),
]

MEMORIES = [
    (0, "You talked about the roses in the back garden. Sarah brought cuttings for the window box."),
    (1, "You watched the football together and John made a pot of tea."),
    (2, "Priya helped you with the crossword and you laughed about the hardest clue."),
]

PHOTOS = [
    ("beach.jpg", "Whitby beach", "A sunny day by the sea. You built a sandcastle and shared fish and chips on the harbour wall.", "Summer 1998", [0], None),
    ("garden.jpg", "The rose garden", "The roses were in full bloom.", "June 2026", [0], 0),
    ("lunch.jpg", "Sunday lunch", "Roast dinner at the big table, with everyone home for the weekend.", "Christmas 2019", [0, 1], None),
]


def remove():
    with get_db() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM people WHERE name LIKE ?", (f"%{MARK}",))]
        photo_ids = {r["photo_id"] for pid in ids
                     for r in c.execute("SELECT photo_id FROM photo_people WHERE person_id=?", (pid,))}
        for pid in ids:
            # Children first (foreign keys are enforced): unlink photos from
            # the memories about to go.
            c.execute("UPDATE photos SET memory_id=NULL WHERE memory_id IN "
                      "(SELECT id FROM memories WHERE person_id=?)", (pid,))
            c.execute("DELETE FROM memories WHERE person_id=?", (pid,))
            c.execute("DELETE FROM visits WHERE person_id=?", (pid,))
            c.execute("DELETE FROM photo_people WHERE person_id=?", (pid,))
            c.execute("DELETE FROM people WHERE id=?", (pid,))
        for ph in photo_ids:
            if not c.execute("SELECT 1 FROM photo_people WHERE photo_id=?", (ph,)).fetchone():
                c.execute("UPDATE people SET photo_path=NULL WHERE photo_path=?", (ph,))
                c.execute("DELETE FROM photos WHERE id=?", (ph,))   # album links cascade
                for name in (f"{ph}.jpg", f"{ph}_thumb.jpg"):
                    (config.PHOTOS_DIR / name).unlink(missing_ok=True)
    print(f"Removed {len(ids)} demo people and their memories and photos.")


def seed():
    with get_db() as c:
        if c.execute("SELECT 1 FROM people WHERE name LIKE ?", (f"%{MARK}",)).fetchone():
            print("Demo data is already loaded (use --remove first to reload).")
            return
        config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
        pids = []
        for name, rel, desc in PEOPLE:
            pid = str(uuid.uuid4())
            c.execute("INSERT INTO people (id, name, relationship, notes) VALUES (?,?,?,?)",
                      (pid, f"{name} {MARK}", rel, f"{desc} {NOTE}"))
            pids.append(pid)
        mem_ids = []
        for who, summary in MEMORIES:
            cur = c.execute("INSERT INTO memories (person_id, summary, source) VALUES (?,?,'manual')",
                            (pids[who], summary))
            mem_ids.append(cur.lastrowid)
        for fname, caption, story, taken, who, mem in PHOTOS:
            ph = uuid.uuid4().hex
            shutil.copyfile(FIXTURES / fname, config.PHOTOS_DIR / f"{ph}.jpg")
            c.execute("INSERT INTO photos (id, filename, caption, story, taken_on, memory_id) VALUES (?,?,?,?,?,?)",
                      (ph, f"{ph}.jpg", caption, story, taken, mem_ids[mem] if mem is not None else None))
            c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)", [(ph, pids[i]) for i in who])
    print(f"Loaded {len(PEOPLE)} demo people, {len(MEMORIES)} memories and {len(PHOTOS)} photos, all marked {MARK}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--remove", action="store_true", help="delete the demo records")
    args = parser.parse_args()
    init_db()
    remove() if args.remove else seed()
