"""
Tests for album_api.py: family photos, profile photos, and the read-only
patient endpoints used by the Family and Memories screens.
"""
import io
import uuid

import cv2
import numpy as np
import pytest

import config
import database


def _jpeg(h=900, w=2400, exif_gps=False):
    ok, buf = cv2.imencode(".jpg", np.full((h, w, 3), 180, np.uint8))
    data = buf.tobytes()
    if exif_gps:
        # Splice a fake APP1/Exif segment carrying a "GPS" marker after SOI.
        payload = b"Exif\x00\x00GPSLatitude=51.5;GPSLongitude=-0.12"
        seg = b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
        data = data[:2] + seg + data[2:]
    return data


@pytest.fixture
def caregiver(client):
    assert client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 200
    return client


@pytest.fixture
def second_person(temp_db):
    pid = str(uuid.uuid4())
    with database.get_db() as c:
        c.execute("INSERT INTO people (id,name,relationship) VALUES (?,?,?)", (pid, "Ana Lee", "Granddaughter"))
    return pid


def _upload(client, **fields):
    files = fields.pop("files", [(io.BytesIO(_jpeg()), "beach.jpg")])
    data = {"photos": files, **fields}
    return client.post("/api/caregiver/photos", data=data, content_type="multipart/form-data")


# ── caregiver photo management ───────────────────────────────────────
def test_photo_endpoints_require_sign_in(client):
    assert client.get("/api/caregiver/photos").status_code == 401
    assert _upload(client).status_code == 401


def test_upload_tags_people_and_reencodes(caregiver, sample_person, second_person):
    resp = _upload(caregiver, caption="Beach day", story="We built a sandcastle.",
                   taken_on="1998-07", person_ids=[sample_person, second_person, "not-a-person"],
                   files=[(io.BytesIO(_jpeg(exif_gps=True)), "beach.jpg"),
                          (io.BytesIO(b"not an image"), "broken.jpg")])
    assert resp.status_code == 201
    body = resp.get_json()
    # Not image bytes at all, despite the .jpg name: refused before decoding.
    assert body["rejected"] == [{"filename": "broken.jpg", "status": "unsupported_type"}]
    photo = body["photos"][0]
    assert photo["caption"] == "Beach day" and photo["taken_on"] == "1998-07"
    assert sorted(p["name"] for p in photo["people"]) == ["Ana Lee", "Test Person"]

    stored = (config.PHOTOS_DIR / f"{photo['id']}.jpg").read_bytes()
    assert b"GPSLatitude" not in stored            # metadata stripped
    img = cv2.imdecode(np.frombuffer(stored, np.uint8), cv2.IMREAD_COLOR)
    assert max(img.shape[:2]) == 1600               # downscaled long edge


def test_upload_rejects_when_nothing_usable(caregiver):
    assert _upload(caregiver, files=[]).status_code == 400
    assert _upload(caregiver, files=[(io.BytesIO(b"junk"), "x.jpg")]).status_code == 400


def test_update_photo_details_and_memory_link(caregiver, sample_person, second_person):
    photo = _upload(caregiver, person_ids=[sample_person]).get_json()["photos"][0]
    mem = caregiver.post("/api/caregiver/memories",
                         json={"person_id": sample_person, "summary": "The beach trip"}).get_json()
    resp = caregiver.put(f"/api/caregiver/photos/{photo['id']}", json={
        "caption": "Seaside", "story": "", "taken_on": "1999", "memory_id": mem["id"],
        "person_ids": [second_person]})
    assert resp.status_code == 200
    updated = resp.get_json()
    assert updated["memory_id"] == mem["id"]
    assert [p["name"] for p in updated["people"]] == ["Ana Lee"]
    # A memory id that doesn't exist is dropped, not stored.
    bad = caregiver.put(f"/api/caregiver/photos/{photo['id']}", json={"memory_id": 99999}).get_json()
    assert bad["memory_id"] is None


def test_profile_photo_is_used_for_the_person_picture(caregiver, sample_person):
    photo = _upload(caregiver, person_ids=[sample_person]).get_json()["photos"][0]
    assert caregiver.get(f"/api/people/{sample_person}/photo").status_code == 404
    assert caregiver.put(f"/api/caregiver/people/{sample_person}/profile-photo",
                         json={"photo_id": photo["id"]}).status_code == 200
    resp = caregiver.get(f"/api/people/{sample_person}/photo")
    assert resp.status_code == 200
    assert resp.data == (config.PHOTOS_DIR / f"{photo['id']}.jpg").read_bytes()
    person = caregiver.get(f"/api/caregiver/people/{sample_person}").get_json()["person"]
    assert person["profile_photo_id"] == photo["id"]
    assert caregiver.put(f"/api/caregiver/people/{sample_person}/profile-photo",
                         json={"photo_id": "missing"}).status_code == 404


def test_deleting_a_photo_clears_profile_and_file(caregiver, sample_person):
    photo = _upload(caregiver, person_ids=[sample_person]).get_json()["photos"][0]
    caregiver.put(f"/api/caregiver/people/{sample_person}/profile-photo", json={"photo_id": photo["id"]})
    assert caregiver.delete(f"/api/caregiver/photos/{photo['id']}").status_code == 200
    assert not (config.PHOTOS_DIR / f"{photo['id']}.jpg").exists()
    with database.get_db() as c:
        assert c.execute("SELECT photo_path FROM people WHERE id=?", (sample_person,)).fetchone()[0] is None
        assert c.execute("SELECT COUNT(*) FROM photo_people").fetchone()[0] == 0


def test_photo_image_ids_cannot_escape_the_photos_folder(client):
    for bad in ("..", "..%2F..%2Fmemory_v2", "abc"):
        assert client.get(f"/api/photos/{bad}/image").status_code == 404


# ── patient read-only endpoints ──────────────────────────────────────
def test_patient_endpoints_follow_the_patient_pin(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    for path in ("/api/family", "/api/album"):
        assert client.get(path).status_code == 401
    client.post("/api/patient/login", json={"pin": "2468"})
    for path in ("/api/family", "/api/album"):
        assert client.get(path).status_code == 200


def test_family_list_and_member_page(caregiver, sample_person):
    with database.get_db() as c:
        c.execute("INSERT INTO memories (person_id, summary, raw_transcript, created_at) VALUES "
                  "(?, 'Talked about the garden', 'um so the garden yeah', '2026-10-01 10:00:00')",
                  (sample_person,))
        c.execute("INSERT INTO visits (person_id, started_at, ended_at, confidence) VALUES "
                  "(?, '2026-10-02 10:00:00', '2026-10-02 10:20:00', 0.71)", (sample_person,))
    photo = _upload(caregiver, person_ids=[sample_person], caption="Garden").get_json()["photos"][0]

    family = caregiver.get("/api/family").get_json()
    assert family[0]["name"] == "Test Person"
    assert family[0]["description"] == "Some notes"
    assert family[0]["recent_memory"]["summary"] == "Talked about the garden"
    assert family[0]["last_visit_at"] == "2026-10-02 10:00:00"
    assert family[0]["photo_count"] == 1

    page = caregiver.get(f"/api/family/{sample_person}").get_json()
    assert page["visits"] == {"count": 1, "recent": ["2026-10-02 10:00:00"]}
    assert page["photos"][0]["id"] == photo["id"]
    # Patients see summaries only: no transcripts or recognition scores.
    flat = str(page)
    assert "um so the garden" not in flat and "raw_transcript" not in flat and "confidence" not in flat
    assert caregiver.get("/api/family/nobody").status_code == 404


def test_album_links_memories_to_their_photo(caregiver, sample_person):
    mem = caregiver.post("/api/caregiver/memories",
                         json={"person_id": sample_person, "summary": "Sunday lunch"}).get_json()
    photo = _upload(caregiver, memory_id=str(mem["id"]), caption="Lunch").get_json()["photos"][0]
    album = caregiver.get("/api/album").get_json()
    assert album["memories"][0]["photo_id"] == photo["id"]
    assert album["memories"][0]["person_name"] == "Test Person"
    assert album["photos"][0]["caption"] == "Lunch"
    assert "raw_transcript" not in album["memories"][0]


def test_every_patient_page_loads_directly_behind_the_pin(client, monkeypatch):
    """Refreshing or bookmarking any patient page serves the app (not 404),
    and the patient PIN still applies."""
    pages = ("/", "/family", "/family/abc", "/memories", "/albums", "/albums/" + "a" * 32)
    for path in pages:
        assert client.get(path).status_code == 200, path
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    for path in pages:
        assert client.get(path).status_code == 302, path
