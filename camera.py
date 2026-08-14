"""
camera.py — webcam access and the MJPEG frame generator for /video.

This is the "producer" side of the producer-consumer queue with worker.py.
"""
import queue
import threading
import time

import cv2

import config
from vision import detect_faces
from worker import frame_q, det_lock, detection
from vision import visit_tracker

_camera  = None
_cam_lock = threading.Lock()
_no_face  = 0


def get_camera():
    global _camera
    with _cam_lock:
        if _camera is None or not _camera.isOpened():
            for idx in [0, 1, 2]:
                cam = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cam.isOpened():
                    cam.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAM_W)
                    cam.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAM_H)
                    cam.set(cv2.CAP_PROP_FPS, 30)
                    cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    time.sleep(0.5)
                    ok, test = cam.read()
                    if ok and test is not None and test.size > 0:
                        _camera = cam
                        print(f"✅ Camera opened on index {idx}")
                        break
                    cam.release()
            if _camera is None:
                print("❌ No camera found")
    return _camera


def generate_frames():
    global _no_face
    cam = get_camera()
    if cam is None:
        return
    C_GREEN = (34, 197, 94); C_AMBER = (251, 191, 36)
    C_GRAY  = (156, 163, 175); C_RED = (60, 60, 220)
    while True:
        ok, frame = cam.read()
        if not ok or frame is None or frame.size == 0:
            time.sleep(0.05)
            continue

        faces = detect_faces(frame)   # YuNet, once per frame
        best_row = max(faces, key=lambda f: f[2] * f[3]) if len(faces) > 0 else None
        try:
            frame_q.put_nowait((frame.copy(), best_row))
        except queue.Full:
            pass

        if best_row is None:
            _no_face += 1
            if _no_face >= config.NO_FACE_TIMEOUT:
                visit_tracker.gone()
                with det_lock:
                    detection.update({
                        "person_id": None, "name": None, "confidence": 0.0,
                        "state": "idle", "emotion": None, "recent_memories": [],
                    })
        else:
            _no_face = 0
            x, y, w, h = [int(v) for v in best_row[:4]]
            with det_lock:
                state = detection["state"]; name = detection["name"]; conf = detection["confidence"]
            color = (C_GREEN if state == "high" else C_AMBER if state == "medium"
                     else C_RED if state == "unknown" else C_GRAY)
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            L = 20
            for px, py, dx, dy in [(x, y, 1, 1), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)]:
                cv2.line(frame, (px, py), (px + dx * L, py), color, 3)
                cv2.line(frame, (px, py), (px, py + dy * L), color, 3)
            if state == "high" and name: label = name.title()
            elif state == "medium" and name: label = f"Maybe {name.title()}?"
            elif state == "unknown": label = "Unknown person"
            else: label = ""
            if label:
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                cv2.rectangle(frame, (x, y - th - 16), (x + tw + 12, y), color, -1)
                cv2.putText(frame, label, (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            bar_w = int(w * min(max(conf, 0.0), 1.0))
            cv2.rectangle(frame, (x, y + h + 4), (x + w, y + h + 10), (40, 40, 40), -1)
            cv2.rectangle(frame, (x, y + h + 4), (x + bar_w, y + h + 10), color, -1)

        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if ret:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")


def capture_enroll_frame(pid):
    cam = get_camera()
    if cam is None:
        return False
    ok, frame = cam.read()
    if not ok or frame is None:
        return False
    faces = detect_faces(frame)
    if len(faces) == 0:
        return False
    x, y, w, h = [int(v) for v in max(faces, key=lambda f: f[2] * f[3])[:4]]
    pad = int(0.35 * max(w, h))
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(frame.shape[1], x + w + pad), min(frame.shape[0], y + h + pad)
    face_dir = config.KNOWN_FACES_DIR / pid
    face_dir.mkdir(parents=True, exist_ok=True)
    count = len(list(face_dir.iterdir()))
    cv2.imwrite(str(face_dir / f"{count:03d}.jpg"), frame[y0:y1, x0:x1])
    return True