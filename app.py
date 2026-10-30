"""
app.py — composition root and entry point for the AI Memory Assistant.

`python app.py` still works exactly as before. This file's only job is to
wire the modules together and run the server — all real logic lives in
config.py, database.py, services.py, vision.py, worker.py, camera.py, and
routes.py. See README.md for the architecture diagram this mirrors.
"""
import config
from app_instance import app
from database import init_db
from vision import load_models, load_known_faces
from worker import start_worker
import routes  # noqa: F401  (import registers every route on `app`)
import api        # noqa: F401  (JSON API for the React frontend)
import album_api  # noqa: F401  (family photos + patient reminiscence)
import albums_api  # noqa: F401  (named photo albums)


def startup():
    """Create data folders, open the DB, load models + gallery, and start the
    recognition worker. Shared by `python app.py` and wsgi.py (gunicorn)."""
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.KNOWN_FACES_DIR.mkdir(exist_ok=True)
    config.UPLOADS_DIR.mkdir(exist_ok=True)
    config.PHOTOS_DIR.mkdir(exist_ok=True)
    config.MODELS_DIR.mkdir(exist_ok=True)

    init_db()
    load_models()
    load_known_faces()
    start_worker()

    from services import WHISPER, TTS, OPENAI
    print("\n🚀 AI Memory Assistant v3.1 — modular architecture")
    print(f"   Camera mode      : {config.CAMERA_MODE}")
    print(f"   Whisper STT      : {'✅' if WHISPER else '❌ disabled'}")
    print(f"   Text-to-speech   : {'✅' if TTS     else '❌ disabled'}")
    print(f"   OpenAI LLM       : {'✅' if OPENAI  else '❌ disabled'}\n")


if __name__ == "__main__":
    startup()
    print(f"   Patient UI  → http://127.0.0.1:5000/")
    print(f"   Caregiver   → http://127.0.0.1:5000/caregiver\n")
    app.run(debug=False, threaded=True, host="0.0.0.0", port=5000)
