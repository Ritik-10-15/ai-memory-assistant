"""
matching_experiment.py — how to score one face against the whole gallery.

    python scripts/matching_experiment.py

Times the ways of computing the best cosine similarity for one 128-d query
against galleries of 1 000 and 5 000 synthetic embeddings, with OpenCV
threads busy in the same process as they are in the app. Used in Phase 8 to
choose the matcher; prints medians in milliseconds.
"""
import statistics
import time

import cv2
import numpy as np


def bench(fn, n=200):
    for _ in range(10):
        fn()
    out = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t) * 1000)
    return statistics.median(out)


def main():
    rng = np.random.default_rng(0)
    rec = cv2.FaceRecognizerSF.create("models/face_recognition_sface_2021dec.onnx", "")
    q = rng.normal(size=(1, 128)).astype(np.float32)
    qn = (q / np.linalg.norm(q)).reshape(-1)
    busy = np.zeros((480, 640, 3), np.uint8)
    for rows in (1_000, 5_000):
        feats = [rng.normal(size=(1, 128)).astype(np.float32) for _ in range(rows)]
        m = np.vstack(feats)
        m /= np.linalg.norm(m, axis=1, keepdims=True)
        loop = lambda: max(rec.match(q, f, cv2.FaceRecognizerSF_FR_COSINE) for f in feats)
        matmul = lambda: float(np.max(m @ qn))
        einsum = lambda: float(np.max(np.einsum("ij,j->i", m, qn)))
        cv2.GaussianBlur(busy, (31, 31), 0)                  # wake OpenCV's thread pool, as in the app
        print(f"{rows} embeddings: per-embedding cv2.match {bench(loop, 30):7.2f} ms | "
              f"numpy @ (BLAS) {bench(matmul):6.3f} ms | einsum (no BLAS) {bench(einsum):6.3f} ms")


if __name__ == "__main__":
    main()
