"""
download_models.py — one-time setup for AI Memory Assistant v3.0
Downloads the two ONNX models (YuNet detector + SFace recognizer)
into ./models/. Run once:  python download_models.py
"""

import os
import urllib.request

MODELS = {
    "models/face_detection_yunet_2023mar.onnx": [
        # Primary: OpenCV Zoo via GitHub media (LFS)
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        # Fallback mirror
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    ],
    "models/face_recognition_sface_2021dec.onnx": [
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    ],
}

MIN_VALID_SIZE = 100_000  # real models are 200KB-40MB; LFS pointer stubs are ~130 bytes


def download(dest, urls):
    if os.path.exists(dest) and os.path.getsize(dest) > MIN_VALID_SIZE:
        print(f"✅ Already present: {dest}")
        return True
    for url in urls:
        try:
            print(f"⬇  Downloading {os.path.basename(dest)} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
            size = os.path.getsize(dest)
            if size > MIN_VALID_SIZE:
                print(f"✅ Saved {dest} ({size/1024:.0f} KB)")
                return True
            print(f"   Got a stub file ({size} bytes), trying next mirror...")
        except Exception as e:
            print(f"   Failed from this mirror: {e}")
    return False


def main():
    os.makedirs("models", exist_ok=True)
    ok = True
    for dest, urls in MODELS.items():
        if not download(dest, urls):
            ok = False
            print(f"\n❌ Could not download {dest}")
            print("   Manual fallback: open this page in your browser and click Download:")
            print("   https://github.com/opencv/opencv_zoo/tree/main/models")
            print(f"   then place the file at: {dest}\n")
    if ok:
        print("\n🎉 All models ready. Now run:  python app.py")


if __name__ == "__main__":
    main()