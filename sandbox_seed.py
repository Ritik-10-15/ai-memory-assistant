"""
sandbox_seed.py — the fictional family every new sandbox starts with.

Three people (the Hughes family from the public demo, plus a neighbour),
their memories, three weeks of visits, two albums and profile pictures.
Every picture is drawn here with simple shapes: no photograph of a real
person is ever used. Nobody in the starter family has face photos, so the
recogniser knows no one until the visitor enrols someone (for example
themselves) — exactly as in a fresh install.
"""
import uuid

import cv2
import numpy as np

import config
from database import get_db

SKIN, NANA_HAIR, NANA_TOP = (178, 196, 233), (222, 222, 226), (196, 160, 186)
PEOPLE = {
    "ruth": {"name": "Ruth Hughes", "relationship": "Daughter", "hair": (60, 82, 120), "top": (106, 122, 224),
             "notes": "Visits on Thursdays and brings the crossword."},
    "daniel": {"name": "Daniel Hughes", "relationship": "Grandson", "hair": (50, 60, 70), "top": (170, 120, 60),
               "notes": "Studying music in Bristol. Plays the piano."},
    "margaret": {"name": "Margaret Ellis", "relationship": "Neighbour", "hair": (190, 190, 200), "top": (120, 160, 110),
                 "notes": "Lives at number 12 and walks her spaniel, Biscuit, past every morning."},
}
MEMORIES = {
    "ruth": [("You planned the birthday lunch together and chose the lemon drizzle.", 4),
             ("Ruth brought the photo album from Cornwall and you laughed about the windbreak that blew away.", 11),
             ("You did the crossword together; Ruth got 7 down, you got the rest.", 18)],
    "daniel": [("Daniel played the piano piece he is learning and told you about his flat in Bristol.", 6),
               ("You talked about strawberry picking on Mill Lane when he was little.", 20)],
    "margaret": [("Margaret came round with Biscuit and you shared a pot of tea in the garden.", 2),
                 ("She told you the roses on the corner are finally out.", 9)],
}
PICTURES = [   # (album, person, scene, title, story, taken_on, memory index or None)
    ("cornwall", "ruth", "seaside", "The beach at St Ives",
     "Ruth built a sandcastle every morning and named each one after a cousin.", "1983-08-14", None),
    ("cornwall", "ruth", "kitchen", "Lemon drizzle lesson",
     "You taught Ruth your lemon drizzle when she was ten. She still bakes it for every birthday.", "1984-04-02", 0),
    ("cornwall", "ruth", "birthday", "Ruth's fortieth",
     "The whole family squeezed into your kitchen, and Ruth cut the cake you had baked together.", "2014-05-18", None),
    ("daniel", "daniel", "garden", "Strawberry picking",
     "Every June you took Daniel to the farm on Mill Lane. He ate more strawberries than he picked.", "2009-06-20", 1),
    ("daniel", "daniel", "seaside", "Rock pools",
     "Daniel found a crab the size of his hand and showed it to everyone on the beach.", "2011-07-30", None),
    ("daniel", "daniel", "birthday", "Daniel turns eighteen",
     "He played the piano for you after the cake — the piece he is still practising.", "2019-03-09", 0),
]
ALBUMS = {
    "cornwall": ("Cornwall summers", "Holidays by the sea with Ruth, and the recipes that came home with you."),
    "daniel": ("Days with Daniel", "Your grandson growing up, from the strawberry farm to his first concert."),
}


# ── drawing ───────────────────────────────────────────────────────────
def _vertical_gradient(h, w, top, bottom):
    t = np.linspace(0, 1, h)[:, None, None]
    img = (1 - t) * np.array(top, float) + t * np.array(bottom, float)
    return np.repeat(img, w, axis=1).astype(np.uint8)


def _figure(img, x, y, hair, top, scale=1.0):
    """A simple standing person: body, head, hair."""
    s = scale
    cv2.ellipse(img, (x, int(y + 150 * s)), (int(70 * s), int(110 * s)), 0, 180, 360, top, -1, cv2.LINE_AA)
    cv2.rectangle(img, (int(x - 70 * s), int(y + 150 * s)), (int(x + 70 * s), int(y + 260 * s)), top, -1)
    cv2.circle(img, (x, y), int(52 * s), SKIN, -1, cv2.LINE_AA)
    cv2.ellipse(img, (x, int(y - 12 * s)), (int(56 * s), int(46 * s)), 0, 180, 360, hair, -1, cv2.LINE_AA)


def _scene(kind, person):
    h, w = 800, 1200
    if kind == "seaside":
        img = _vertical_gradient(h, w, (238, 222, 196), (226, 236, 244))
        cv2.circle(img, (220, 160), 70, (78, 193, 242), -1, cv2.LINE_AA)
        img[400:540] = (176, 155, 91)
        for x in range(0, w, 60):
            cv2.line(img, (x, 440), (x + 40, 440), (238, 222, 196), 3, cv2.LINE_AA)
        img[540:] = (168, 211, 235)
        for i, x in enumerate(range(900, 1080, 60)):
            cv2.rectangle(img, (x, 470), (x + 60, 640), (106, 122, 224) if i % 2 == 0 else (246, 252, 255), -1)
    elif kind == "garden":
        img = _vertical_gradient(h, w, (201, 227, 249), (226, 239, 244))
        cv2.circle(img, (980, 150), 70, (78, 193, 242), -1, cv2.LINE_AA)
        cv2.fillPoly(img, [np.array([[0, 520], [300, 440], [700, 500], [1200, 430], [1200, 800], [0, 800]])], (161, 197, 156))
        cv2.fillPoly(img, [np.array([[0, 640], [400, 580], [800, 630], [1200, 590], [1200, 800], [0, 800]])], (124, 159, 110))
        for x in (90, 160, 1040, 1110):
            cv2.circle(img, (x, 690), 18, (106, 122, 224), -1, cv2.LINE_AA)
            cv2.circle(img, (x, 690), 7, (201, 227, 249), -1, cv2.LINE_AA)
    elif kind == "kitchen":
        img = np.full((h, w, 3), (210, 228, 241), np.uint8)
        for x in range(0, w, 120):
            cv2.line(img, (x, 0), (x, 380), (190, 213, 230), 3)
        cv2.rectangle(img, (90, 160), (430, 176), (94, 138, 185), -1)
        for x, c in ((120, (74, 163, 226)), (190, (161, 197, 156)), (260, (106, 122, 224))):
            cv2.rectangle(img, (x, 96), (x + 48, 160), c, -1)
        cv2.circle(img, (1000, 160), 80, (246, 252, 255), -1, cv2.LINE_AA)
    else:   # birthday
        img = _vertical_gradient(h, w, (238, 230, 246), (226, 239, 244))
        cv2.line(img, (40, 80), (1160, 80), (94, 138, 185), 3, cv2.LINE_AA)
        for i, x in enumerate(range(80, 1160, 110)):
            pts = np.array([[x, 82], [x + 60, 82], [x + 30, 140]])
            cv2.fillPoly(img, [pts], [(106, 122, 224), (78, 193, 242), (161, 197, 156)][i % 3], cv2.LINE_AA)
    _figure(img, 430, 380, NANA_HAIR, NANA_TOP)
    _figure(img, 760, 360, PEOPLE[person]["hair"], PEOPLE[person]["top"])
    if kind in ("kitchen", "birthday"):
        cv2.rectangle(img, (150, 650), (1050, 800), (126, 162, 201), -1)
        cv2.ellipse(img, (600, 640), (130, 34), 0, 0, 360, (246, 252, 255), -1, cv2.LINE_AA)
        cv2.rectangle(img, (520, 570), (680, 640), (238, 230, 246) if kind == "birthday" else (78, 193, 242), -1)
        if kind == "birthday":
            for x in (560, 600, 640):
                cv2.rectangle(img, (x - 5, 530), (x + 5, 570), (161, 197, 156), -1)
                cv2.ellipse(img, (x, 520), (7, 12), 0, 0, 360, (78, 193, 242), -1, cv2.LINE_AA)
    return img


def _portrait(person):
    img = np.full((800, 800, 3), (226, 239, 244), np.uint8)
    cv2.circle(img, (400, 400), 330, (238, 230, 246), -1, cv2.LINE_AA)
    p = PEOPLE[person]
    _figure(img, 400, 300, p["hair"], p["top"], scale=1.9)
    return img


def _save_picture(c, img, caption, story="", taken_on="", memory_id=None, location=""):
    from album_api import _fit, _write_thumb, MAX_SIDE
    photo_id = uuid.uuid4().hex
    folder = config.photos_dir()
    folder.mkdir(parents=True, exist_ok=True)
    img = _fit(img, MAX_SIDE)
    cv2.imwrite(str(folder / f"{photo_id}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    _write_thumb(img, folder / f"{photo_id}_thumb.jpg")
    c.execute("INSERT INTO photos (id, filename, caption, story, taken_on, memory_id, location, width, height) "
              "VALUES (?,?,?,?,?,?,?,?,?)",
              (photo_id, f"{photo_id}.jpg", caption, story, taken_on, memory_id, location, img.shape[1], img.shape[0]))
    return photo_id


# ── seeding ───────────────────────────────────────────────────────────
def seed():
    """Fill the current (empty) sandbox database and photo folder."""
    with get_db() as c:
        ids, memory_ids = {}, {}
        for key, p in PEOPLE.items():
            ids[key] = str(uuid.uuid4())
            c.execute("INSERT INTO people (id, name, relationship, notes) VALUES (?,?,?,?)",
                      (ids[key], p["name"], p["relationship"], p["notes"]))
            portrait = _save_picture(c, _portrait(key), f"{p['name'].split()[0]} (illustration)")
            c.execute("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)", (portrait, ids[key]))
            c.execute("UPDATE people SET photo_path=? WHERE id=?", (portrait, ids[key]))
            memory_ids[key] = []
            for summary, days in MEMORIES[key]:
                cur = c.execute("INSERT INTO memories (person_id, summary, source, created_at) "
                                "VALUES (?, ?, 'manual', datetime('now', ?))", (ids[key], summary, f"-{days} days"))
                memory_ids[key].append(cur.lastrowid)
        # Three weeks of visits: Ruth on Thursdays, Daniel at weekends, Margaret most mornings.
        for key, days, minutes in (("ruth", (3, 10, 17), 70), ("daniel", (6, 13, 20), 95),
                                   ("margaret", (1, 2, 4, 5, 8, 9, 11, 12, 15, 16, 19), 20)):
            for d in days:
                c.execute("INSERT INTO visits (person_id, started_at, ended_at, duration_s, confidence) "
                          "VALUES (?, datetime('now', ?), datetime('now', ?), ?, 0.82)",
                          (ids[key], f"-{d} days", f"-{d} days", minutes * 60))
        album_ids = {}
        for key, (title, description) in ALBUMS.items():
            album_ids[key] = uuid.uuid4().hex
            c.execute("INSERT INTO albums (id, title, description, visible_to_patient) VALUES (?,?,?,1)",
                      (album_ids[key], title, description))
        for position, (album, person, scene, title, story, taken_on, mem) in enumerate(PICTURES):
            memory_id = memory_ids[person][mem] if mem is not None else None
            photo = _save_picture(c, _scene(scene, person), title, story, taken_on, memory_id)
            c.execute("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)", (photo, ids[person]))
            c.execute("INSERT INTO album_photos (album_id, photo_id, position) VALUES (?,?,?)",
                      (album_ids[album], photo, position))
