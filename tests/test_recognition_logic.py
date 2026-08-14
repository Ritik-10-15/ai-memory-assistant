"""
Tests for the matching logic in cosine_match().

The real SFace model (~38 MB .onnx file) isn't available in CI, and
shouldn't be — recognition CORRECTNESS is what we're testing here, not
the model itself. So we swap app._recognizer for a tiny fake object that
computes real cosine similarity in plain numpy. This tests the actual
logic your app runs (loop through the gallery, keep the best score)
without needing GPU/model weights in the test environment.
"""
import numpy as np
import app as app_module


class _FakeRecognizer:
    """Mimics cv2.FaceRecognizerSF.match() using real cosine similarity."""
    def match(self, feat1, feat2, metric):
        a = np.asarray(feat1).reshape(-1)
        b = np.asarray(feat2).reshape(-1)
        denom = (np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0:
            return 0.0
        return float(np.dot(a, b) / denom)


def test_cosine_match_returns_highest_score_in_gallery(monkeypatch):
    monkeypatch.setattr(app_module, "_recognizer", _FakeRecognizer())

    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    identical      = np.array([1.0, 0.0, 0.0], dtype=np.float32)   # score 1.0
    somewhat_close = np.array([0.7, 0.7, 0.0], dtype=np.float32)   # lower score
    opposite       = np.array([-1.0, 0.0, 0.0], dtype=np.float32)  # score -1.0

    best = app_module.cosine_match(query, [opposite, somewhat_close, identical])
    assert best == pytest_approx(1.0)


def test_cosine_match_with_empty_gallery_returns_sentinel(monkeypatch):
    monkeypatch.setattr(app_module, "_recognizer", _FakeRecognizer())
    result = app_module.cosine_match(np.array([1.0, 0.0]), [])
    # No candidates at all -> the documented "no match" sentinel.
    assert result == -1.0


def pytest_approx(value, tol=1e-4):
    class _Approx:
        def __eq__(self, other):
            return abs(other - value) < tol
    return _Approx()


def test_recognize_rejects_when_gallery_empty(monkeypatch):
    """With nobody enrolled, recognize() must return 'no match' — never
    guess. This is the open-set rejection behavior the whole project
    depends on for safety."""
    monkeypatch.setattr(app_module, "_gallery", {})
    monkeypatch.setattr(app_module, "_name_map", {})
    pid, score, name = app_module.recognize(bgr=None, face_row=None)
    assert pid is None
    assert name is None