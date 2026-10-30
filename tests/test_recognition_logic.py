"""
Tests for vision.cosine_match() and vision.recognize().

Uses a lightweight fake recognizer instead of the real 38MB SFace model,
so these run fast and need no model files in CI.
"""
import numpy as np
import vision


class _FakeRecognizer:
    """Mimics cv2.FaceRecognizerSF.match() using real cosine similarity."""
    def match(self, feat1, feat2, metric):
        a = np.asarray(feat1).reshape(-1)
        b = np.asarray(feat2).reshape(-1)
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        if denom == 0:
            return 0.0
        return float(np.dot(a, b) / denom)


def _approx(value, tol=1e-4):
    class _Approx:
        def __eq__(self, other):
            return abs(other - value) < tol
    return _Approx()


def test_cosine_match_returns_highest_score_in_gallery(monkeypatch):
    monkeypatch.setattr(vision, "_recognizer", _FakeRecognizer())

    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    identical      = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    somewhat_close = np.array([0.7, 0.7, 0.0], dtype=np.float32)
    opposite       = np.array([-1.0, 0.0, 0.0], dtype=np.float32)

    best = vision.cosine_match(query, [opposite, somewhat_close, identical])
    assert best == _approx(1.0)


def test_cosine_match_with_empty_gallery_returns_sentinel(monkeypatch):
    monkeypatch.setattr(vision, "_recognizer", _FakeRecognizer())
    result = vision.cosine_match(np.array([1.0, 0.0]), [])
    assert result == -1.0


def test_recognize_rejects_when_gallery_empty(monkeypatch):
    """With nobody enrolled, recognize() must return 'no match' — never
    guess. This is the open-set rejection behavior the whole project
    depends on for safety."""
    monkeypatch.setattr(vision, "_gallery", {})
    monkeypatch.setattr(vision, "_name_map", {})
    pid, score, name = vision.recognize(bgr=None, face_row=None)
    assert pid is None
    assert name is None

# ── Phase 8: the whole gallery is scored in one matrix product ───────
def _use_gallery(monkeypatch, gallery):
    """Install a gallery the way load_known_faces() does: by replacing it."""
    monkeypatch.setattr(vision, "_gallery", gallery)
    monkeypatch.setattr(vision, "_name_map", {pid: pid.upper() for pid in gallery})


def _frame_embedding(monkeypatch, query):
    monkeypatch.setattr(vision, "embed_face", lambda bgr, row: query)


def test_recognize_agrees_with_comparing_every_embedding_one_by_one(monkeypatch):
    """Same person, same score (and the same open-set rejection) as the
    per-embedding cosine loop the matcher replaced."""
    monkeypatch.setattr(vision, "_recognizer", _FakeRecognizer())
    rng = np.random.default_rng(3)
    gallery = {f"p{i}": [rng.normal(size=(1, 128)).astype(np.float32) for _ in range(5)] for i in range(40)}
    _use_gallery(monkeypatch, gallery)
    accepted = rejected = 0
    for trial in range(40):
        if trial % 4 == 3:                      # a stranger
            query = rng.normal(size=(1, 128)).astype(np.float32)
        else:                                   # a noisy view of someone enrolled
            target = gallery[f"p{trial}"][trial % 5]
            query = (target + rng.normal(scale=0.3 + trial * 0.08, size=target.shape)).astype(np.float32)
        _frame_embedding(monkeypatch, query)
        best_pid, best = None, -1.0
        for pid, feats in gallery.items():
            s = vision.cosine_match(query, feats)
            if s > best:
                best_pid, best = pid, s
        pid, score, name = vision.recognize(bgr=None, face_row=None)
        assert score == _approx(best, 1e-5)
        if best >= vision.config.SCORE_MEDIUM:
            assert (pid, name) == (best_pid, best_pid.upper())
            accepted += 1
        else:
            assert (pid, name) == (None, None)
            rejected += 1
    assert accepted and rejected                # both sides of the threshold were exercised


def test_a_reloaded_gallery_is_used_for_the_next_frame(monkeypatch):
    first = np.ones((1, 128), np.float32)
    second = -first
    _use_gallery(monkeypatch, {"before": [first]})
    _frame_embedding(monkeypatch, second)
    assert vision.recognize(bgr=None, face_row=None)[0] is None
    _use_gallery(monkeypatch, {"after": [second]})        # a person enrolled / gallery reloaded
    assert vision.recognize(bgr=None, face_row=None)[0] == "after"
    _use_gallery(monkeypatch, {})                         # everyone deleted
    assert vision.recognize(bgr=None, face_row=None) == (None, 0.0, None)


def test_recognising_a_frame_writes_nothing_to_the_log(monkeypatch, capsys):
    """Phase 8: one log line per frame grew the container log without limit
    and recorded who was recognised. Only errors are logged now."""
    feat = np.ones((1, 128), np.float32)
    _use_gallery(monkeypatch, {"sarah": [feat]})
    _frame_embedding(monkeypatch, feat)
    for _ in range(10):
        assert vision.recognize(bgr=None, face_row=None)[0] == "sarah"
    assert capsys.readouterr().out == ""
