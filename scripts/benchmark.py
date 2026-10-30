"""
benchmark.py — reproducible performance benchmark (Phase 8).

    python scripts/benchmark.py FACE.jpg --label baseline
    python scripts/benchmark.py FACE.jpg --label after --sections pipeline,api
    python scripts/benchmark.py FACE.jpg --label baseline-2core --cores 2 --sections recognition,pipeline

FACE.jpg is a photo of one consenting person; it is only read, never copied.
Everything runs against a THROWAWAY data folder with synthetic people,
memories, visits and photos — never the real database or real photos —
and nothing personal is written to the results. Results go to
docs/benchmarks/<label>.json; compare two runs with
scripts/compare_benchmarks.py.

Sections: cold, recognition, pipeline, api, sqlite, speech (speech is
opt-in: it loads Whisper and transcribes synthetic text-to-speech audio).
"""
import argparse
import io
import json
import os
import platform
import queue
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
TMP = Path(tempfile.mkdtemp(prefix="ma-bench-"))
os.environ["DATA_DIR"] = str(TMP)
os.environ.setdefault("CAREGIVER_PASSWORD", "bench-pass")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

RESULTS = {}

from bench_data import add_visits, gallery_of, seed_database  # noqa: E402  (after DATA_DIR is set)


# ── helpers ───────────────────────────────────────────────────────────
def summarize(values, unit="ms"):
    v = sorted(values)
    if not v:
        return {"n": 0, "unit": unit}
    pct = lambda q: v[min(len(v) - 1, max(0, round(q * (len(v) - 1))))]
    return {"n": len(v), "unit": unit, "median": round(statistics.median(v), 3),
            "p95": round(pct(0.95), 3), "min": round(v[0], 3), "max": round(v[-1], 3),
            "mean": round(statistics.fmean(v), 3)}


def put(section, name, value):
    RESULTS.setdefault(section, {})[name] = value
    if isinstance(value, dict) and "median" in value:
        print(f"  {name:<58} median {value['median']:9.2f}  p95 {value['p95']:9.2f} {value['unit']}  (n={value['n']})", file=sys.__stdout__)
    else:
        print(f"  {name:<58} {value}", file=sys.__stdout__)


def timed(fn, n, warmup=3):
    for _ in range(warmup):
        fn()
    out = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t) * 1000)
    return out


def rss_mb():
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
        k32.K32GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb)
        return pmc.WorkingSetSize / 2**20
    except Exception:
        return float("nan")


def limit_cores(n):
    """Pin this process to n logical CPUs and give OpenCV n threads — a rough
    stand-in for a small cloud instance (it does not emulate ARM)."""
    import cv2
    cv2.setNumThreads(n)
    mask = (1 << n) - 1
    if hasattr(os, "sched_setaffinity"):
        os.sched_setaffinity(0, set(range(n)))
    else:
        import ctypes
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = ctypes.c_void_p
        k32.SetProcessAffinityMask(ctypes.c_void_p(k32.GetCurrentProcess()), ctypes.c_size_t(mask))


def environment(cores):
    import cv2
    import flask  # noqa: F401
    import numpy as np
    import sqlite3
    from importlib.metadata import version
    cpu = platform.processor()
    if sys.platform == "win32":
        try:
            cpu = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"],
                                 capture_output=True, text=True, timeout=30).stdout.strip() or cpu
        except Exception:
            pass
    return {"cpu": cpu, "logical_cpus": os.cpu_count(), "cores_used": cores or os.cpu_count(),
            "os": platform.platform(), "python": platform.python_version(),
            "opencv": cv2.__version__, "numpy": np.__version__, "flask": version("flask"),
            "sqlite": sqlite3.sqlite_version, "date": time.strftime("%Y-%m-%d %H:%M")}


# ── synthetic data (scripts/bench_data.py) ──────────────────────────────
def install_gallery(gallery):
    import vision
    with vision._gallery_lock:
        vision._gallery.clear()
        vision._gallery.update(gallery)
        vision._name_map.clear()
        vision._name_map.update({p: "Visitor" if p == "visitor" else "Synthetic" for p in gallery})
    if hasattr(vision, "_rebuild_matrix"):
        vision._rebuild_matrix()


# ── sections ──────────────────────────────────────────────────────────
COLD_SNIPPET = r"""
import json, os, sys, time
sys.path.insert(0, {root!r})
t0 = time.perf_counter()
import services
t1 = time.perf_counter()
import app
t2 = time.perf_counter()
import vision
vision.load_models()
t3 = time.perf_counter()
print("BENCH" + json.dumps({{"services": (t1 - t0) * 1000, "app": (t2 - t0) * 1000, "models": (t3 - t2) * 1000,
                            "whisper": bool(services.WHISPER)}}))
"""


def section_cold(runs=3):
    print("\nCold start (fresh process each run)")
    out = {"services": [], "app": [], "models": []}
    whisper = None
    for i in range(runs):
        d = tempfile.mkdtemp(prefix="ma-cold-")
        env = dict(os.environ, DATA_DIR=d, PYTHONIOENCODING="utf-8")
        p = subprocess.run([sys.executable, "-c", COLD_SNIPPET.format(root=str(ROOT))], cwd=str(ROOT),
                           env=env, capture_output=True, text=True, encoding="utf-8", timeout=600)
        line = next((ln for ln in p.stdout.splitlines() if ln.startswith("BENCH")), None)
        if not line:
            print(p.stdout[-2000:], p.stderr[-2000:])
            raise SystemExit("cold-start run failed")
        r = json.loads(line[5:])
        whisper = r["whisper"]
        for k in out:
            out[k].append(r[k])
    put("cold", "import services (optional speech/LLM libraries)", summarize(out["services"]))
    put("cold", "import app (all modules, incl. services)", summarize(out["app"]))
    put("cold", "load YuNet + SFace models", summarize(out["models"]))
    put("cold", "whisper_installed", whisper)


def section_recognition(face):
    import cv2
    import numpy as np
    import camera
    import vision
    print("\nRecognition (warm, one 640x480 frame)")
    put("recognition", "YuNet detection", summarize(timed(lambda: vision.detect_faces(face), 100)))
    jpg = cv2.imencode(".jpg", face, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()
    put("recognition", "JPEG decode (browser frame)", summarize(timed(lambda: camera.decode_jpeg(jpg), 100)))
    row = max(vision.detect_faces(face), key=lambda f: f[2] * f[3])
    put("recognition", "SFace align + embedding", summarize(timed(lambda: vision.embed_face(face, row), 100)))
    rng = np.random.default_rng(0)
    for people in (1, 10, 50, 200, 500):
        install_gallery(gallery_of(people, 10, rng))
        put("recognition", f"recognize() gallery {people} people x 10",
            summarize(timed(lambda: vision.recognize(face, row), 60)))


class _Sink(io.TextIOBase):
    """Stands in for the container log: counts what the app prints."""
    def __init__(self):
        self.bytes = 0
        self.lines = 0

    def write(self, s):
        self.bytes += len(s.encode("utf-8"))
        self.lines += s.count("\n")
        return len(s)


PIPE = {"offered": 0, "processed": 0, "wait": [], "age": [], "process": [], "last_return": None}


def _reset_pipe_log():
    PIPE.update(offered=0, processed=0, wait=[], age=[], process=[], last_return=None)


def _instrument_queue(q):
    """Timestamp every frame offered to the queue and time the worker's
    waits and work. Installed once, before the worker thread starts, so the
    worker never sees an unwrapped queue."""
    real_put, real_get = q.put_nowait, q.get

    def put_nowait(item):
        PIPE["offered"] += 1
        return real_put((item[0], item[1], time.perf_counter()))

    def get(*a, **k):
        t0 = time.perf_counter()
        if PIPE["last_return"] is not None:
            PIPE["process"].append((t0 - PIPE["last_return"]) * 1000)
        try:
            item = real_get(*a, **k)
        except queue.Empty:
            PIPE["last_return"] = None
            raise
        now = time.perf_counter()
        PIPE["wait"].append((now - t0) * 1000)
        PIPE["age"].append((now - item[2]) * 1000)
        PIPE["processed"] += 1
        PIPE["last_return"] = now
        return item[0], item[1]

    q.put_nowait, q.get = put_nowait, get


def _run_pipeline(name, face, blank, gallery, producer, cycles=6, face_s=3.0, empty_s=5.0, poll=False):
    """Alternate a known face and an empty scene; measure frame freshness,
    throughput, CPU and how quickly the shared identity follows the scene."""
    import worker
    import app as app_module
    install_gallery(gallery)
    worker.reset_state()
    while True:
        try:
            worker.frame_q.get_nowait()
        except queue.Empty:
            break
    _reset_pipe_log()
    log = PIPE
    timeline, polls, depth = [], [], []
    stop = threading.Event()

    def monitor():
        last = None
        while not stop.is_set():
            with worker.det_lock:
                s = worker.detection["state"]
            if s != last:
                timeline.append((time.perf_counter(), s))
                last = s
            depth.append(worker.frame_q.qsize())
            time.sleep(0.001)

    def poller():
        client = app_module.app.test_client()
        while not stop.is_set():
            s = client.get("/api/current-person").get_json()["state"]
            polls.append((time.perf_counter(), s))
            time.sleep(0.7)

    threads = [threading.Thread(target=monitor, daemon=True)]
    if poll:
        threads.append(threading.Thread(target=poller, daemon=True))
    for t in threads:
        t.start()
    switches = []
    cpu0, wall0 = time.process_time(), time.perf_counter()
    for _ in range(cycles):
        for scene, dur in (("face", face_s), ("empty", empty_s)):
            switches.append((time.perf_counter(), scene))
            end = time.perf_counter() + dur
            while time.perf_counter() < end:
                producer(face if scene == "face" else blank)
    cpu, wall = time.process_time() - cpu0, time.perf_counter() - wall0
    time.sleep(0.3)
    stop.set()
    for t in threads:
        t.join()

    def latency(events, scene, test):
        out = []
        for i, (t0, sc) in enumerate(switches):
            if sc != scene:
                continue
            t1 = switches[i + 1][0] if i + 1 < len(switches) else float("inf")
            hit = next((t for t, s in events if t0 <= t < t1 and test(s)), None)
            if hit is not None:
                out.append((hit - t0) * 1000)
        return out

    sec = f"pipeline:{name}"
    put(sec, "frames offered by producer", log["offered"])
    put(sec, "frames recognised by worker", log["processed"])
    put(sec, "producer rate (frames/s)", round(log["offered"] / wall, 2))
    put(sec, "consumer rate (frames/s)", round(log["processed"] / wall, 2))
    put(sec, "frames never recognised (%)", round(100 * (1 - log["processed"] / max(1, log["offered"])), 1))
    put(sec, "frame age when recognition starts", summarize(log["age"][3:]))
    put(sec, "worker time per frame (recognise + state)", summarize(log["process"][3:]))
    put(sec, "worker idle wait per frame", summarize(log["wait"][3:]))
    put(sec, "queue depth (sampled every ms)", summarize(depth, unit="frames"))
    put(sec, "process CPU (% of one core)", round(100 * cpu / wall, 1))
    put(sec, "visitor appears -> state 'high'", summarize(latency(timeline, "face", lambda s: s == "high")))
    put(sec, "visitor leaves -> state no longer 'high'", summarize(latency(timeline, "empty", lambda s: s != "high")))
    if poll:
        put(sec, "end-to-end: appears -> patient poll shows them",
            summarize(latency(polls, "face", lambda s: s == "high")))
        put(sec, "end-to-end: leaves -> patient poll stops showing them",
            summarize(latency(polls, "empty", lambda s: s != "high")))
    put(sec, "memory RSS after (MB)", round(rss_mb(), 1))


def section_pipeline(face):
    import cv2
    import numpy as np
    import camera
    import vision
    import worker
    import app as app_module
    print("\nProducer-consumer pipeline (real models, real queue and worker thread)")
    blank = np.full_like(face, 128)
    flipped = cv2.flip(face, 1)
    frow = max(vision.detect_faces(flipped), key=lambda f: f[2] * f[3])
    visitor = {"visitor": [vision.embed_face(flipped, frow)]}   # a different photo of the same face
    rng = np.random.default_rng(1)
    vision.visit_tracker.seen = lambda *a, **k: None             # no visit rows / greetings
    sink = _Sink()
    _instrument_queue(worker.frame_q)
    real_stdout, sys.stdout = sys.stdout, sink
    try:
        worker.start_worker()
    finally:
        sys.stdout = real_stdout

    def paced(fps):
        def producer(frame):
            t = time.perf_counter()
            camera.process_frame(frame)
            time.sleep(max(0.0, 1 / fps - (time.perf_counter() - t)))
        return producer

    client = app_module.app.test_client()
    jpgs = {}

    def browser(frame):
        key = id(frame)
        if key not in jpgs:
            jpgs[key] = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()
        client.post("/api/frame", data=jpgs[key], content_type="image/jpeg")
        time.sleep(0.150)                                      # FRAME_GAP_MS after each reply

    scenarios = [
        ("server-camera 30fps, 30 people", paced(30), gallery_of(30, 10, rng, visitor), False),
        ("patient device (browser cadence), 30 people", browser, gallery_of(30, 10, rng, visitor), True),
        ("overload 30fps, 500 people", paced(30), gallery_of(500, 10, rng, visitor), False),
    ]
    for name, producer, gallery, poll in scenarios:
        print(f" scenario: {name}")
        bytes0, lines0 = sink.bytes, sink.lines
        real_stdout, sys.stdout = sys.stdout, sink
        try:
            _run_pipeline(name, face, blank, gallery, producer, poll=poll)
        finally:
            sys.stdout = real_stdout
        put(f"pipeline:{name}", "log output (bytes)", sink.bytes - bytes0)
        put(f"pipeline:{name}", "log output (lines)", sink.lines - lines0)


def section_api(face):
    import cv2
    import config
    import vision
    import app as app_module
    print("\nAPI (in-process Flask test client; representative synthetic data)")
    t = time.perf_counter()
    pids, photo_ids = seed_database()
    put("api", "seed: 30 people, 1500 memories, 20000 visits, 360 photos (s)", round(time.perf_counter() - t, 1))
    face_dir = config.KNOWN_FACES_DIR
    for p in pids:                         # enrollment photos make photo_count a real directory listing
        (face_dir / p).mkdir(parents=True, exist_ok=True)
        for k in range(8):
            (face_dir / p / f"{k:03d}.jpg").write_bytes(b"\xff\xd8\xff")
    install_gallery(gallery_of(30, 10, __import__("numpy").random.default_rng(2)))
    vision.visit_tracker.seen = lambda *a, **k: None
    cg = app_module.app.test_client()
    assert cg.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 200
    pt = app_module.app.test_client()
    album = pt.get("/api/albums").get_json()[0]["id"]
    jpg = cv2.imencode(".jpg", face, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()
    pid = pids[3]
    cases = [
        ("patient", "GET /api/current-person", lambda: pt.get("/api/current-person"), 200),
        ("patient", "POST /api/frame", lambda: pt.post("/api/frame", data=jpg, content_type="image/jpeg"), 200),
        ("patient", "GET /api/status", lambda: pt.get("/api/status"), 200),
        ("patient", "GET /api/family", lambda: pt.get("/api/family"), 200),
        ("patient", "GET /api/family/<id>", lambda: pt.get(f"/api/family/{pid}"), 200),
        ("patient", "GET /api/album (Memories page)", lambda: pt.get("/api/album"), 200),
        ("patient", "GET /api/albums", lambda: pt.get("/api/albums"), 200),
        ("patient", "GET /api/albums/<id> (30 photos)", lambda: pt.get(f"/api/albums/{album}"), 200),
        ("patient", "GET photo thumbnail", lambda: pt.get(f"/api/photos/{photo_ids[0]}/image?size=thumb"), 200),
        ("patient", "GET photo full size", lambda: pt.get(f"/api/photos/{photo_ids[0]}/image"), 200),
        ("caregiver", "GET /api/caregiver/people", lambda: cg.get("/api/caregiver/people"), 200),
        ("caregiver", "GET /api/caregiver/people/<id>", lambda: cg.get(f"/api/caregiver/people/{pid}"), 200),
        ("caregiver", "GET /api/caregiver/memories", lambda: cg.get("/api/caregiver/memories"), 200),
        ("caregiver", "GET /api/caregiver/visits", lambda: cg.get("/api/caregiver/visits"), 200),
        ("caregiver", "GET /api/caregiver/analytics", lambda: cg.get("/api/caregiver/analytics"), 200),
        ("caregiver", "GET /api/caregiver/albums", lambda: cg.get("/api/caregiver/albums"), 200),
        ("caregiver", "GET /api/caregiver/photos", lambda: cg.get("/api/caregiver/photos"), 200),
        ("caregiver", "POST /api/caregiver/memories",
         lambda: cg.post("/api/caregiver/memories", json={"person_id": pid, "summary": "Bench memory"}), 201),
        ("caregiver", "PATCH /api/caregiver/albums/<id>",
         lambda: cg.patch(f"/api/caregiver/albums/{album}", json={"description": "Bench"}), 200),
    ]
    for who, name, fn, expected in cases:
        failures, sizes, ms = 0, [], []
        for i in range(3 + 100):
            t0 = time.perf_counter()
            r = fn()
            dt = (time.perf_counter() - t0) * 1000
            if i >= 3:
                ms.append(dt)
                sizes.append(len(r.get_data()))
                failures += r.status_code != expected
        s = summarize(ms)
        s.update(failures=failures, requests=len(ms), bytes=int(statistics.median(sizes)))
        put("api", f"{name}", s)
    put("api", "memory RSS after (MB)", round(rss_mb(), 1))


SQL_CASES = {
    "caregiver visits list": "SELECT v.*, p.name AS person_name, p.relationship FROM visits v "
                             "JOIN people p ON p.id=v.person_id ORDER BY v.started_at DESC LIMIT 200",
    "caregiver memories list": "SELECT m.*, p.name AS person_name FROM memories m JOIN people p ON p.id=m.person_id "
                               "ORDER BY m.created_at DESC LIMIT 500",
    "analytics: last 30 days": "SELECT DATE(started_at) AS day, COUNT(*) FROM visits "
                               "WHERE started_at >= DATE('now', '-29 days') GROUP BY day ORDER BY day",
    "analytics: per person": "SELECT p.id, COUNT(v.id), COALESCE(AVG(v.duration_s), 0), MAX(v.started_at) "
                             "FROM people p LEFT JOIN visits v ON p.id=v.person_id GROUP BY p.id",
    "people list (counts)": "SELECT p.*, (SELECT COUNT(*) FROM memories m WHERE m.person_id=p.id), "
                            "(SELECT COUNT(*) FROM visits v WHERE v.person_id=p.id), "
                            "(SELECT MAX(started_at) FROM visits v WHERE v.person_id=p.id) FROM people p",
    "recognised person details": "SELECT started_at FROM visits WHERE person_id=? AND ended_at IS NOT NULL "
                                 "ORDER BY started_at DESC LIMIT 1",
    "patient recent visits": "SELECT v.*,p.name,p.relationship FROM visits v JOIN people p ON v.person_id=p.id "
                             "ORDER BY v.started_at DESC LIMIT 15",
}


def section_sqlite():
    import database
    print("\nSQLite (query plans and timings on the seeded database)")
    with database.get_db() as c:
        pid = c.execute("SELECT id FROM people LIMIT 1").fetchone()[0]
    put("sqlite", "open connection (get_db)", summarize(timed(lambda: database.get_db().close(), 300)))
    for visits in (20_000, 100_000):
        if visits == 100_000:
            add_visits(80_000)
        for name, sql in SQL_CASES.items():
            args = (pid,) if "?" in sql else ()
            with database.get_db() as c:
                plan = [r[3] for r in c.execute("EXPLAIN QUERY PLAN " + sql, args)]
                ms = timed(lambda: c.execute(sql, args).fetchall(), 30)
            s = summarize(ms)
            s["plan"] = plan
            put("sqlite", f"{name} @ {visits} visits", s)
            if visits == 100_000:
                print(f"      plan: {' | '.join(plan)}")


def section_speech():
    print("\nSpeech (optional; synthetic text-to-speech audio only)")
    t = time.perf_counter()
    try:
        import whisper
    except ImportError:
        put("speech", "whisper", "not installed — not measured")
        return
    import services
    put("speech", "whisper loaded at import of services", bool(services.WHISPER))
    model = whisper.load_model("base")
    put("speech", "load Whisper 'base' (warm file cache, ms)", round((time.perf_counter() - t) * 1000))
    import pyttsx3
    texts = {"short": "We went to the seaside last Sunday and had fish and chips.",
             "long": ("Last weekend Sarah came over with the children. We looked at the old photographs from the "
                      "summer in Whitby, talked about the garden and the roses, and she promised to bring the "
                      "recipe for the lemon cake next time she visits on Tuesday afternoon.")}
    engine = pyttsx3.init()
    for name, text in texts.items():
        wav = TMP / f"{name}.wav"
        engine.save_to_file(text, str(wav))
        engine.runAndWait()
        import wave
        with wave.open(str(wav)) as w:
            seconds = w.getnframes() / w.getframerate()
        ms = timed(lambda: model.transcribe(str(wav), fp16=False), 3, warmup=1)
        s = summarize(ms)
        s["audio_seconds"] = round(seconds, 1)
        put("speech", f"transcribe {name} clip ({seconds:.0f} s audio)", s)
    put("speech", "LLM summarisation", "not measured — needs OPENAI_API_KEY and the openai package")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("face")
    ap.add_argument("--label", required=True)
    ap.add_argument("--sections", default="cold,recognition,pipeline,api,sqlite")
    ap.add_argument("--cores", type=int, default=0, help="limit to N logical CPUs (rough small-instance stand-in)")
    a = ap.parse_args()
    sections = a.sections.split(",")
    if a.cores:
        limit_cores(a.cores)
    if "cold" in sections:
        section_cold()                                       # before this process imports anything heavy
    import cv2
    import config
    import database
    import vision
    config.DATA_DIR = TMP
    config.DB_PATH = str(TMP / "memory_v2.db")
    config.PHOTOS_DIR = TMP / "photos"
    config.KNOWN_FACES_DIR = TMP / "known_faces"
    config.GALLERY_CACHE = TMP / "gallery_cache.npz"
    database.init_db()
    rss0 = rss_mb()
    vision.load_models()
    put("memory", "RSS before models (MB, includes optional libraries)", round(rss0, 1))
    put("memory", "RSS added by YuNet + SFace (MB)", round(rss_mb() - rss0, 1))
    img = cv2.imread(a.face)
    if img is None:
        raise SystemExit(f"cannot read {a.face}")
    face = cv2.resize(img, (640, 480))
    RESULTS["meta"] = {"label": a.label, "sections": sections, **environment(a.cores)}
    print(json.dumps(RESULTS["meta"], indent=1))
    if "recognition" in sections:
        section_recognition(face)
    if "pipeline" in sections:
        section_pipeline(face)
    if "api" in sections or "sqlite" in sections:
        section_api(face)
    if "sqlite" in sections:
        section_sqlite()
    if "speech" in sections:
        section_speech()
    out = ROOT / "docs" / "benchmarks" / f"{a.label}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(RESULTS, indent=1))
    print(f"\nSaved {out.relative_to(ROOT)}", flush=True)
    sys.stderr.flush()
    os._exit(0)                                             # the worker is a daemon thread


if __name__ == "__main__":
    main()
