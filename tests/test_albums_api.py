"""
Tests for albums_api.py and the Phase 5 photo rules in album_api.py:
albums (create / edit / order / cover / delete), upload validation,
thumbnails, people links, and what the patient may and may not see.
"""
import io
import uuid

import cv2
import numpy as np
import pytest

import album_api
import app as app_module
import config
import database


def _jpeg(h=600, w=800):
    ok, buf = cv2.imencode(".jpg", np.full((h, w, 3), 150, np.uint8))
    return buf.tobytes()


def _png():
    ok, buf = cv2.imencode(".png", np.full((300, 400, 3), 90, np.uint8))
    return buf.tobytes()


@pytest.fixture
def caregiver(client):
    assert client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 200
    return client


@pytest.fixture
def patient(client):
    """A second browser on the patient's device: no caregiver session. (Not
    a `with` block: two of those would interleave request contexts.)"""
    return app_module.app.test_client()


@pytest.fixture
def ana(temp_db):
    pid = str(uuid.uuid4())
    with database.get_db() as c:
        c.execute("INSERT INTO people (id,name,relationship) VALUES (?,?,?)", (pid, "Ana Lee", "Granddaughter"))
    return pid


def _album(client, title="Summer 1998", **extra):
    resp = client.post("/api/caregiver/albums", json={"title": title, **extra})
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["album"]


def _upload_to(client, album_id, files=None, **fields):
    files = files or [(io.BytesIO(_jpeg()), "a.jpg")]
    return client.post(f"/api/caregiver/albums/{album_id}/photos", data={"photos": files, **fields},
                       content_type="multipart/form-data")


def _photo_ids(client, album_id):
    return [p["id"] for p in client.get(f"/api/caregiver/albums/{album_id}").get_json()["photos"]]


# ── authorization ────────────────────────────────────────────────────
def test_album_management_requires_caregiver(client, patient):
    assert client.get("/api/caregiver/albums").status_code == 401
    assert client.post("/api/caregiver/albums", json={"title": "x"}).status_code == 401
    assert client.patch("/api/caregiver/albums/abc", json={"title": "x"}).status_code == 401
    assert client.delete("/api/caregiver/albums/abc").status_code == 401
    assert patient.put("/api/caregiver/albums/abc/photos/order", json={"photo_ids": []}).status_code == 401


def test_patient_album_endpoints_follow_the_pin(caregiver, patient, monkeypatch):
    album = _album(caregiver)
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    assert patient.get("/api/albums").status_code == 401
    assert patient.get(f"/api/albums/{album['id']}").status_code == 401
    patient.post("/api/patient/login", json={"pin": "2468"})
    assert patient.get("/api/albums").status_code == 200
    assert patient.get(f"/api/albums/{album['id']}").status_code == 200


# ── albums: create, edit, order, cover ───────────────────────────────
def test_create_and_edit_album_with_validation(caregiver):
    assert caregiver.post("/api/caregiver/albums", json={"title": "  "}).get_json()["error"]
    album = _album(caregiver, description="The caravan holiday.")
    assert album["photo_count"] == 0 and album["cover_photo_id"] is None and album["visible_to_patient"] is True

    resp = caregiver.patch(f"/api/caregiver/albums/{album['id']}",
                           json={"title": "Whitby, summer 1998", "visible_to_patient": False})
    assert resp.status_code == 200
    updated = resp.get_json()["album"]
    assert updated["title"] == "Whitby, summer 1998" and updated["visible_to_patient"] is False
    assert updated["description"] == "The caravan holiday."            # untouched field kept
    assert caregiver.patch(f"/api/caregiver/albums/{album['id']}", json={"title": ""}).status_code == 400
    assert caregiver.patch("/api/caregiver/albums/missing", json={"title": "x"}).status_code == 404
    assert [a["title"] for a in caregiver.get("/api/caregiver/albums").get_json()] == ["Whitby, summer 1998"]


def test_upload_into_album_with_details_and_several_people(caregiver, sample_person, ana):
    album = _album(caregiver)
    resp = _upload_to(caregiver, album["id"], caption="Sandcastle", story="We built it together.",
                      location="Whitby", category="holiday", prompt="Would you like to hear about the sandcastle?",
                      taken_on="1998-07", person_ids=[sample_person, ana])
    assert resp.status_code == 201
    photo = resp.get_json()["photos"][0]
    assert (photo["caption"], photo["location"], photo["category"]) == ("Sandcastle", "Whitby", "holiday")
    assert photo["prompt"] == "Would you like to hear about the sandcastle?"
    assert {(p["name"], p["relationship"]) for p in photo["people"]} == {("Test Person", "Friend"), ("Ana Lee", "Granddaughter")}
    assert photo["albums"] == [{"id": album["id"], "title": "Summer 1998"}]
    assert (photo["width"], photo["height"]) == (800, 600)
    # An unknown category is stored as "no category", not as free text.
    other = _upload_to(caregiver, album["id"], category="<script>").get_json()["photos"][-1]
    assert other["category"] == ""


def test_reorder_cover_and_remove_from_album(caregiver):
    album = _album(caregiver)
    for name in ("a.jpg", "b.jpg", "c.jpg"):
        _upload_to(caregiver, album["id"], files=[(io.BytesIO(_jpeg()), name)])
    a, b, c = _photo_ids(caregiver, album["id"])

    order = f"/api/caregiver/albums/{album['id']}/photos/order"
    assert caregiver.put(order, json={"photo_ids": [c, a, b]}).status_code == 200
    assert _photo_ids(caregiver, album["id"]) == [c, a, b]
    assert caregiver.put(order, json={"photo_ids": [c, a]}).status_code == 400        # one missing
    assert caregiver.put(order, json={"photo_ids": [c, a, a]}).status_code == 400     # duplicate

    detail = caregiver.get(f"/api/caregiver/albums/{album['id']}").get_json()["album"]
    assert detail["cover_photo_id"] == c and detail["cover_chosen"] is False          # first photo by default
    assert caregiver.patch(f"/api/caregiver/albums/{album['id']}", json={"cover_photo_id": b}).status_code == 200
    assert caregiver.patch(f"/api/caregiver/albums/{album['id']}",
                           json={"cover_photo_id": uuid.uuid4().hex}).status_code == 400

    resp = caregiver.delete(f"/api/caregiver/albums/{album['id']}/photos/{b}")
    assert resp.get_json()["album"]["cover_photo_id"] == c                             # chosen cover cleared
    assert _photo_ids(caregiver, album["id"]) == [c, a]
    assert caregiver.get("/api/caregiver/photos").get_json()                           # photo still in library
    assert any(p["id"] == b for p in caregiver.get("/api/caregiver/photos").get_json())


def test_add_existing_library_photos(caregiver):
    first, second = _album(caregiver, "One"), _album(caregiver, "Two")
    _upload_to(caregiver, first["id"])
    (pid,) = _photo_ids(caregiver, first["id"])
    url = f"/api/caregiver/albums/{second['id']}/photos"
    assert caregiver.post(url, json={"photo_ids": [pid]}).status_code == 200
    assert caregiver.post(url, json={"photo_ids": [pid]}).status_code == 200          # adding twice is harmless
    assert _photo_ids(caregiver, second["id"]) == [pid]
    assert caregiver.post(url, json={"photo_ids": ["0" * 32]}).status_code == 400


# ── upload validation ────────────────────────────────────────────────
def test_upload_validation_reasons(caregiver, monkeypatch):
    album = _album(caregiver)
    gif = b"GIF89a" + b"\x00" * 50
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"
    broken_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 64
    resp = _upload_to(caregiver, album["id"], files=[
        (io.BytesIO(gif), "party.gif"), (io.BytesIO(svg), "logo.jpg"),
        (io.BytesIO(broken_jpeg), "half.jpg"), (io.BytesIO(_png()), "scan.png")])
    assert resp.status_code == 201
    assert resp.get_json()["rejected"] == [
        {"filename": "party.gif", "status": "unsupported_type"},
        {"filename": "logo.jpg", "status": "unsupported_type"},
        {"filename": "half.jpg", "status": "invalid_image"},
    ]
    assert len(resp.get_json()["photos"]) == 1                                         # the PNG

    monkeypatch.setattr(album_api, "MAX_FILE_BYTES", 1000)
    resp = _upload_to(caregiver, album["id"])
    assert resp.status_code == 400 and resp.get_json()["rejected"][0]["status"] == "too_large"

    monkeypatch.setattr(album_api, "MAX_FILES", 2)
    resp = _upload_to(caregiver, album["id"], files=[(io.BytesIO(_jpeg()), f"{i}.jpg") for i in range(3)])
    assert resp.status_code == 400 and "at most 2" in resp.get_json()["error"]
    assert _upload_to(caregiver, "missing").status_code == 404


def test_thumbnails_are_made_and_served(caregiver):
    album = _album(caregiver)
    _upload_to(caregiver, album["id"], files=[(io.BytesIO(_jpeg(1200, 1600)), "big.jpg")])
    (pid,) = _photo_ids(caregiver, album["id"])
    thumb = config.PHOTOS_DIR / f"{pid}_thumb.jpg"
    assert thumb.exists()
    img = cv2.imdecode(np.frombuffer(caregiver.get(f"/api/photos/{pid}/image?size=thumb").data, np.uint8), 1)
    assert max(img.shape[:2]) == 480
    thumb.unlink()                                                                     # older photo: made on demand
    assert caregiver.get(f"/api/photos/{pid}/image?size=thumb").status_code == 200 and thumb.exists()


# ── deletion and file clean-up ───────────────────────────────────────
def test_deleting_an_album_keeps_photos_by_default(caregiver):
    album = _album(caregiver)
    _upload_to(caregiver, album["id"])
    (pid,) = _photo_ids(caregiver, album["id"])
    assert caregiver.delete(f"/api/caregiver/albums/{album['id']}").get_json() == {"ok": True, "deleted_photos": 0}
    assert caregiver.get(f"/api/caregiver/albums/{album['id']}").status_code == 404
    assert (config.PHOTOS_DIR / f"{pid}.jpg").exists()
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM album_photos").fetchone()[0] == 0


def test_deleting_an_album_with_its_photos_cleans_up_files(caregiver, sample_person):
    album, other = _album(caregiver, "Going"), _album(caregiver, "Staying")
    _upload_to(caregiver, album["id"], person_ids=[sample_person],
               files=[(io.BytesIO(_jpeg()), "only.jpg"), (io.BytesIO(_jpeg()), "shared.jpg")])
    only, shared = _photo_ids(caregiver, album["id"])
    caregiver.post(f"/api/caregiver/albums/{other['id']}/photos", json={"photo_ids": [shared]})
    caregiver.put(f"/api/caregiver/people/{sample_person}/profile-photo", json={"photo_id": only})

    resp = caregiver.delete(f"/api/caregiver/albums/{album['id']}?delete_photos=1")
    assert resp.get_json()["deleted_photos"] == 1
    assert not (config.PHOTOS_DIR / f"{only}.jpg").exists()
    assert not (config.PHOTOS_DIR / f"{only}_thumb.jpg").exists()
    assert (config.PHOTOS_DIR / f"{shared}.jpg").exists()                              # still in "Staying"
    assert _photo_ids(caregiver, other["id"]) == [shared]
    with database.get_db() as c:
        assert c.execute("SELECT photo_path FROM people WHERE id=?", (sample_person,)).fetchone()[0] is None
        assert c.execute("SELECT COUNT(*) FROM photo_people WHERE photo_id=?", (only,)).fetchone()[0] == 0


def test_deleting_a_photo_removes_it_from_albums_and_clears_the_cover(caregiver):
    album = _album(caregiver)
    _upload_to(caregiver, album["id"])
    (pid,) = _photo_ids(caregiver, album["id"])
    caregiver.patch(f"/api/caregiver/albums/{album['id']}", json={"cover_photo_id": pid})
    assert caregiver.delete(f"/api/caregiver/photos/{pid}").status_code == 200
    detail = caregiver.get(f"/api/caregiver/albums/{album['id']}").get_json()
    assert detail["photos"] == [] and detail["album"]["cover_photo_id"] is None
    assert not (config.PHOTOS_DIR / f"{pid}_thumb.jpg").exists()


# ── what the patient sees ────────────────────────────────────────────
def test_patient_sees_only_shown_albums_and_their_photos(caregiver, patient, sample_person):
    shown = _album(caregiver, "Shown")
    hidden = _album(caregiver, "Draft", visible_to_patient=False)
    _upload_to(caregiver, shown["id"], person_ids=[sample_person])
    _upload_to(caregiver, hidden["id"], person_ids=[sample_person], caption="Not ready yet")
    (visible,), (secret,) = _photo_ids(caregiver, shown["id"]), _photo_ids(caregiver, hidden["id"])

    assert [a["title"] for a in patient.get("/api/albums").get_json()] == ["Shown"]
    assert "visible_to_patient" not in patient.get("/api/albums").get_json()[0]
    assert patient.get(f"/api/albums/{hidden['id']}").status_code == 404
    assert patient.get(f"/api/photos/{secret}/image").status_code == 404
    assert patient.get(f"/api/photos/{secret}/image?size=thumb").status_code == 404
    assert patient.get(f"/api/photos/{visible}/image").status_code == 200
    assert caregiver.get(f"/api/photos/{secret}/image").status_code == 200            # caregiver sees all

    # Hidden-only photos are left out of every other patient view too.
    assert [p["id"] for p in patient.get("/api/album").get_json()["photos"]] == [visible]
    member = patient.get(f"/api/family/{sample_person}").get_json()
    assert [p["id"] for p in member["photos"]] == [visible] and member["person"]["photo_count"] == 1
    assert "Not ready yet" not in patient.get(f"/api/family/{sample_person}").get_data(as_text=True)

    # In a hidden AND a shown album: visible. Showing the draft reveals it.
    caregiver.post(f"/api/caregiver/albums/{shown['id']}/photos", json={"photo_ids": [secret]})
    assert patient.get(f"/api/photos/{secret}/image").status_code == 200
    caregiver.delete(f"/api/caregiver/albums/{shown['id']}/photos/{secret}")
    caregiver.patch(f"/api/caregiver/albums/{hidden['id']}", json={"visible_to_patient": True})
    assert patient.get(f"/api/photos/{secret}/image").status_code == 200


def test_patient_album_detail_has_people_story_and_conversation_highlight(caregiver, patient, sample_person, ana):
    with database.get_db() as c:
        mid = c.execute("INSERT INTO memories (person_id, summary, raw_transcript) VALUES "
                        "(?, 'You talked about the beach.', 'um the beach')", (sample_person,)).lastrowid
    album = _album(caregiver, description="By the sea.")
    _upload_to(caregiver, album["id"], person_ids=[sample_person, ana], story="Ice cream on the pier.",
               memory_id=str(mid))
    body = patient.get(f"/api/albums/{album['id']}").get_json()
    assert body["album"]["description"] == "By the sea." and body["total"] == 1
    photo = body["photos"][0]
    assert photo["story"] == "Ice cream on the pier."
    assert len(photo["people"]) == 2
    assert photo["memory"]["summary"] == "You talked about the beach."
    assert "albums" not in photo
    assert "um the beach" not in patient.get(f"/api/albums/{album['id']}").get_data(as_text=True)


def test_patient_album_pages(caregiver, patient):
    album = _album(caregiver)
    _upload_to(caregiver, album["id"], files=[(io.BytesIO(_jpeg()), f"{i}.jpg") for i in range(5)])
    ids = _photo_ids(caregiver, album["id"])
    page = patient.get(f"/api/albums/{album['id']}?limit=2&offset=2").get_json()
    assert [p["id"] for p in page["photos"]] == ids[2:4]
    assert (page["total"], page["limit"], page["offset"]) == (5, 2, 2)
    assert patient.get(f"/api/albums/{album['id']}?limit=junk").get_json()["limit"] == 60


def test_photo_details_keep_new_fields_when_an_older_client_saves(caregiver):
    album = _album(caregiver)
    _upload_to(caregiver, album["id"], location="Whitby", prompt="Shall we look at the boats?")
    (pid,) = _photo_ids(caregiver, album["id"])
    resp = caregiver.put(f"/api/caregiver/photos/{pid}", json={"caption": "Boats", "story": "", "taken_on": ""})
    photo = resp.get_json()
    assert photo["caption"] == "Boats" and photo["location"] == "Whitby"
    assert photo["prompt"] == "Shall we look at the boats?"
    photo = caregiver.put(f"/api/caregiver/photos/{pid}", json={"location": "", "category": "family"}).get_json()
    assert photo["location"] == "" and photo["category"] == "family"


def test_an_oversized_request_gets_a_json_message(caregiver, monkeypatch):
    album = _album(caregiver)
    monkeypatch.setitem(app_module.app.config, "MAX_CONTENT_LENGTH", 2000)
    resp = _upload_to(caregiver, album["id"])
    assert resp.status_code == 413 and "too large" in resp.get_json()["error"]
