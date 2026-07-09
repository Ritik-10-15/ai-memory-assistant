"""
capture_faces.py
Standalone photo-capture tool for AlzheimerMemoryAssistant (Path A fix).

Purpose:
  LBPH recognition is weak (dist ~102) because the enrolled photos likely
  don't match real-world sitting distance/angle/lighting. This script grabs
  40+ fresh photos of ONE person, guiding you through angle/distance/expression
  variation, so LBPH has enough real-world variety to bring dist down to ~60.

Usage:
  1. Stop app.py (camera can only be used by one process at a time).
  2. Activate venv:  venv\\Scripts\\activate
  3. Run:            python capture_faces.py
  4. Enter the person's existing UUID (folder name under known_faces\\) OR
     let the script create a new one if enrolling fresh.
  5. Follow on-screen prompts. Press SPACE to capture a shot, 'q' to quit early.
  6. Re-run your LBPH training/recompute step in app.py afterward.

Notes:
  - Saves into known_faces\\<uuid>\\ to match your existing folder structure.
  - Uses the same Haar cascade approach your app likely already uses for
    face detection, so captured crops are consistent with recognition input.
  - Prompts cycle through distance/angle/expression combos to force variety,
    which is what actually helps LBPH more than raw photo count.
"""

import cv2
import os
import sys
import time
import uuid as uuid_lib

KNOWN_FACES_DIR = "known_faces"
TARGET_SHOTS = 45  # a bit over 40 to allow for a few blurry/bad ones
FACE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

# Prompts designed to force real variety instead of 40 near-identical frames.
# LBPH benefits far more from varied angle/distance/expression than raw count.
PROMPTS = [
    "Look straight at camera, NORMAL sitting distance (arm's length)",
    "Look straight at camera, slightly CLOSER",
    "Look straight at camera, slightly FARTHER",
    "Turn head slightly LEFT",
    "Turn head slightly RIGHT",
    "Tilt head slightly UP",
    "Tilt head slightly DOWN",
    "Neutral expression",
    "Smiling",
    "Talking / mouth open",
    "Normal distance, different lighting angle (turn a lamp or move seat)",
    "Glasses on (if applicable) or normal",
    "Slight left turn + smiling",
    "Slight right turn + neutral",
    "Normal distance, relaxed natural pose",
]


def get_face_detector():
    cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
    if cascade.empty():
        print("ERROR: Could not load Haar cascade. Check your OpenCV install.")
        sys.exit(1)
    return cascade


def ensure_person_folder():
    print("\n=== AlzheimerMemoryAssistant — Face Capture (Path A) ===\n")
    print("1) Add photos to an EXISTING person (enter their UUID)")
    print("2) Create a NEW person folder (new UUID)")
    choice = input("Choose 1 or 2: ").strip()

    if choice == "1":
        existing = [d for d in os.listdir(KNOWN_FACES_DIR)] if os.path.isdir(KNOWN_FACES_DIR) else []
        if existing:
            print("\nExisting folders:")
            for d in existing:
                print(f"  - {d}")
        pid = input("\nPaste the person's UUID exactly: ").strip()
        folder = os.path.join(KNOWN_FACES_DIR, pid)
        if not os.path.isdir(folder):
            print(f"WARNING: {folder} does not exist yet — it will be created.")
            os.makedirs(folder, exist_ok=True)
        return folder, pid
    else:
        pid = str(uuid_lib.uuid4())
        folder = os.path.join(KNOWN_FACES_DIR, pid)
        os.makedirs(folder, exist_ok=True)
        print(f"\nCreated new person UUID: {pid}")
        print("Remember to add this person's name/relationship in the DB via the caregiver panel,")
        print("or update memory_v2.db manually to match this UUID.")
        return folder, pid


def main():
    if not os.path.isdir(KNOWN_FACES_DIR):
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

    folder, pid = ensure_person_folder()
    existing_count = len([f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".png"))])
    print(f"\nFolder: {folder}")
    print(f"Existing photos: {existing_count}")
    print(f"Target additional shots: {TARGET_SHOTS}")
    print("\nControls: SPACE = capture, 'q' = quit early\n")
    time.sleep(1)

    detector = get_face_detector()
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open webcam. Is app.py still running? Close it first.")
        sys.exit(1)

    shots_taken = 0
    prompt_idx = 0

    while shots_taken < TARGET_SHOTS:
        ret, frame = cap.read()
        if not ret:
            print("Camera read failed, retrying...")
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

        display = frame.copy()
        prompt = PROMPTS[prompt_idx % len(PROMPTS)]

        # Draw guidance overlay
        cv2.putText(display, f"Shots: {shots_taken}/{TARGET_SHOTS}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.putText(display, prompt, (10, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.putText(display, "SPACE = capture   q = quit", (10, display.shape[0] - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

        face_ok = False
        for (x, y, w, h) in faces:
            color = (0, 255, 0) if w >= 100 else (0, 165, 255)
            cv2.rectangle(display, (x, y), (x + w, y + h), color, 2)
            face_ok = True

        if not face_ok:
            cv2.putText(display, "No face detected", (10, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        cv2.imshow("Face Capture - AlzheimerMemoryAssistant", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            print("\nQuitting early by user request.")
            break

        if key == ord(' '):
            if not face_ok:
                print("  Skipped: no face detected in frame.")
                continue
            # Save the largest detected face crop
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            pad = int(0.15 * w)
            x0, y0 = max(0, x - pad), max(0, y - pad)
            x1, y1 = min(frame.shape[1], x + w + pad), min(frame.shape[0], y + h + pad)
            face_crop = frame[y0:y1, x0:x1]

            filename = os.path.join(folder, f"{pid}_{existing_count + shots_taken + 1:03d}.jpg")
            cv2.imwrite(filename, face_crop)
            shots_taken += 1
            prompt_idx += 1
            print(f"  Captured {shots_taken}/{TARGET_SHOTS}: {os.path.basename(filename)}")
            time.sleep(0.3)  # brief pause so you can reposition before next shot

    cap.release()
    cv2.destroyAllWindows()

    print(f"\nDone. Captured {shots_taken} new photos in:\n  {folder}")
    print("\nNEXT STEPS:")
    print("  1. Re-run your LBPH training/recompute step in app.py (recognizer.train / update).")
    print("  2. Start app.py and test recognition at real sitting distance while moving slightly.")
    print("  3. Check the console/log for the new 'dist' value — target ~60 or lower.")
    print("  4. If dist is still high (>80) even with good photos, that's the signal to move to")
    print("     Path B (InsightFace/ArcFace) rather than adding more LBPH photos.")


if __name__ == "__main__":
    main()