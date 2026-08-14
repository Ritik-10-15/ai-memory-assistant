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