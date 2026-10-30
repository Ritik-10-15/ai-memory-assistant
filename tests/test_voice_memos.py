"""
Voice memos (optional Whisper). Phase 8: Whisper loads on a background
thread instead of blocking startup, so availability is read at request time.
"""
import io

import services


def test_voice_memos_are_refused_when_whisper_is_unavailable(client, sample_person, monkeypatch):
    monkeypatch.setattr(services, "WHISPER", False)        # e.g. it failed to load after startup
    r = client.post("/api/upload-audio", data={"person_id": sample_person, "audio": (io.BytesIO(b"x"), "memo.webm")},
                    content_type="multipart/form-data")
    assert r.status_code == 503


def test_a_memo_is_handed_to_the_background_transcriber(client, sample_person, monkeypatch, tmp_path):
    import config
    import routes
    monkeypatch.setattr(services, "WHISPER", True)
    monkeypatch.setattr(config, "UPLOADS_DIR", tmp_path)
    started = []
    monkeypatch.setattr(routes, "auto_log", lambda pid, path: started.append(pid))
    r = client.post("/api/upload-audio", data={"person_id": sample_person, "audio": (io.BytesIO(b"x"), "memo.webm")},
                    content_type="multipart/form-data")
    assert r.status_code == 200
    for _ in range(100):
        if started:
            break
        __import__("time").sleep(0.01)
    assert started == [sample_person]


def test_transcription_waits_for_the_model_and_skips_when_it_failed(monkeypatch):
    calls = []
    monkeypatch.setattr(services, "WHISPER", False)
    monkeypatch.setattr(services, "_whisper_model", None)
    services._whisper_ready.set()
    services.auto_log("someone", "memo.webm")              # nothing to do, no crash
    assert calls == []
