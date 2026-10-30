"""
measure_performance.py — time the recognition pipeline and the API on this
machine, using the real models and a THROWAWAY database (never real data).

    python scripts/measure_performance.py path/to/one-face-photo.jpg

Reports medians / 95th percentiles in milliseconds. Galleries and album
sizes are synthetic (random embeddings, blank photos) — they measure cost,
not accuracy.
"""
import io
import os
import statistics
import sys
import tempfile
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP = tempfile.mkdtemp(prefix="ma-perf-")
os.environ["DATA_DIR"] = TMP
os.environ.setdefault("CAREGIVER_PASSWORD", "perf-pass")

import cv2          # noqa: E402
import numpy as np  # noqa: E402

import config       # noqa: E402
import database     # noqa: E402
import vision       # noqa: E402
import worker       # noqa: E402
import app as app_module  # noqa: E402  (registers routes)


def rss_mb():
    """Resident memory of this process, in MB (Linux / Windows)."""
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024
    except OSError:
        pass
    try:
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (n, ctypes.c_size_t) for n in ("Peak", "WorkingSetSize", "QPPeak", "QP", "QNPPeak", "QNP", "Pagefile", "PeakPagefile")]
        pmc = PMC(cb=ctypes.sizeof(PMC))
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        k32.K32GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        if not k32.K32GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
            return float("nan")
        return pmc.WorkingSetSize / 2**20
    except Exception:
        return float("nan")


def timed(fn, n):
    out = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t) * 1000)
    return out


def report(label, ms):
    ms = sorted(ms)
    p95 = ms[max(0, int(len(ms) * 0.95) - 1)]
    print(f"  {label:<52} median {statistics.median(ms):7.1f} ms   p95 {p95:7.1f} ms   (n={len(ms)})")


def main(face_path):
    config.DATA_DIR = config.Path(TMP)
    config.DB_PATH = os.path.join(TMP, "memory_v2.db")
    config.PHOTOS_DIR = config.Path(TMP) / "photos"
    config.KNOWN_FACES_DIR = config.Path(TMP) / "known_faces"
    database.init_db()
    rss0 = rss_mb()
    vision.load_models()
    rss_models = rss_mb()

    face = cv2.resize(cv2.imread(face_path), (640, 480))
    print(f"Machine: {os.cpu_count()} logical CPUs · OpenCV {cv2.__version__} · frame 640x480\n")
    print("Recognition pipeline")
    report("YuNet detection (one frame)", timed(lambda: vision.detect_faces(face), 60))
    row = max(vision.detect_faces(face), key=lambda f: f[2] * f[3])
    report("SFace embedding (one face)", timed(lambda: vision.embed_face(face, row), 60))

    feat = vision.embed_face(face, row)
    for people in (1, 50, 500):
        rng = np.random.default_rng(0)
        gallery = {str(uuid.uuid4()): [rng.normal(size=feat.shape).astype(np.float32) for _ in range(10)] for _ in range(people)}
        with vision._gallery_lock:
            vision._gallery.clear()
            vision._gallery.update(gallery)
            vision._name_map.clear()
            vision._name_map.update({p: "x" for p in gallery})
        report(f"recognize() incl. embedding, gallery {people} people x 10", timed(lambda: vision.recognize(face, row), 40))

    # Frame freshness: a producer at ~30 fps (server webcam) through the real
    # queue and worker thread; how old is each frame when it is recognised?
    with vision._gallery_lock:
        vision._gallery.clear()
        vision._gallery.update({"me": [feat]})
        vision._name_map.clear()
        vision._name_map.update({"me": "Me"})
    import camera
    ages = []
    real_get = worker.frame_q.get

    def timed_get(*a, **k):
        item = real_get(*a, **k)
        ages.append((time.perf_counter() - item[2]) * 1000)
        return item[0], item[1]
    worker.frame_q.get = timed_get
    real_put = worker.frame_q.put_nowait
    worker.frame_q.put_nowait = lambda item: real_put((item[0], item[1], time.perf_counter()))
    worker.start_worker()
    dropped = 0
    t_end = time.perf_counter() + 8
    while time.perf_counter() < t_end:
        t = time.perf_counter()
        before = worker.frame_q.qsize()
        camera.process_frame(face)
        dropped += before == config.FRAME_QUEUE_SIZE
        time.sleep(max(0, 1 / 30 - (time.perf_counter() - t)))
    worker.frame_q.put_nowait, worker.frame_q.get = real_put, real_get
    time.sleep(0.5)
    report("frame age when recognised (producer ~30 fps)", ages[5:])
    print(f"  {'frames produced / recognised':<52} {len(ages) + dropped} / {len(ages)}")

    # Identity step with a real person + memories in SQLite.
    pid = str(uuid.uuid4())
    with database.get_db() as c:
        c.execute("INSERT INTO people (id, name, relationship) VALUES (?, 'Perf', 'Friend')", (pid,))
        c.executemany("INSERT INTO memories (person_id, summary) VALUES (?, ?)", [(pid, f"m{i}") for i in range(200)])
        c.executemany("INSERT INTO visits (person_id, ended_at, duration_s) VALUES (?, CURRENT_TIMESTAMP, 60)", [(pid,)] * 2000)
    worker.visit_tracker.seen = lambda *a, **k: None
    report("identity step, confirmed (DB lookup of details)", timed(lambda: worker._step(pid, 0.7, "Perf", True), 200))
    report("identity step, nobody", timed(lambda: worker._step(None, 0.0, None, False), 200))

    # API through Flask's test client (no network; measures the app itself).
    client = app_module.app.test_client()
    client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    jpg = cv2.imencode(".jpg", face)[1].tobytes()
    print("\nAPI (in-process, signed in)")
    report("POST /api/frame (decode + detect + enqueue)", timed(lambda: client.post("/api/frame", data=jpg, content_type="image/jpeg"), 60))
    report("GET  /api/current-person", timed(lambda: client.get("/api/current-person"), 200))
    for i in range(50):
        with database.get_db() as c:
            c.execute("INSERT INTO people (id, name) VALUES (?, ?)", (str(uuid.uuid4()), f"P{i}"))
    report("GET  /api/caregiver/people (51 people, 2000 visits)", timed(lambda: client.get("/api/caregiver/people"), 40))
    report("GET  /api/caregiver/visits", timed(lambda: client.get("/api/caregiver/visits"), 40))

    album = client.post("/api/caregiver/albums", json={"title": "Perf"}).get_json()["album"]["id"]
    blank = cv2.imencode(".jpg", np.full((900, 1200, 3), 120, np.uint8))[1].tobytes()
    up = timed(lambda: client.post(f"/api/caregiver/albums/{album}/photos", content_type="multipart/form-data",
                                   data={"photos": [(io.BytesIO(blank), "p.jpg")]}), 30)
    report("upload one 1200x900 photo into an album", up)
    report("GET  /api/albums/<id> (30 photos)", timed(lambda: client.get(f"/api/albums/{album}"), 40))
    report("GET  /api/album (patient Memories)", timed(lambda: client.get("/api/album"), 40))
    some = client.get(f"/api/albums/{album}").get_json()["photos"][0]["id"]
    full = client.get(f"/api/photos/{some}/image").data
    thumb = client.get(f"/api/photos/{some}/image?size=thumb").data
    print(f"\nImage sizes: full {len(full)/1024:.0f} KB, thumbnail {len(thumb)/1024:.0f} KB (blank 1200x900 test photo)")
    print(f"Memory: {rss0:.0f} MB before models, {rss_models:.0f} MB with models, {rss_mb():.0f} MB at the end")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
