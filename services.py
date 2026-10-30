"""
services.py — optional AI features: speech-to-text, text-to-speech, and
LLM summarization. Each is wrapped in try/except so a missing library or
model never takes down the rest of the app — see the README section on
graceful degradation of optional dependencies.
"""
import importlib.util
import os
import threading

from database import get_db

# Whisper takes seconds and several hundred MB to load, so it loads on a
# background thread instead of delaying startup. WHISPER says whether voice
# memos are available; it turns False if loading fails.
WHISPER = importlib.util.find_spec("whisper") is not None
_whisper_model = None
_whisper_ready = threading.Event()


def _load_whisper():
    global WHISPER, _whisper_model
    try:
        import whisper
        _whisper_model = whisper.load_model("base")
        print("✅ Whisper loaded")
    except Exception:
        WHISPER = False
    finally:
        _whisper_ready.set()


if WHISPER:
    threading.Thread(target=_load_whisper, daemon=True).start()
else:
    _whisper_ready.set()

try:
    import openai
    OPENAI = True
except Exception:
    OPENAI = False

try:
    import pyttsx3
    _tts_engine = pyttsx3.init()
    TTS = True
    print("✅ TTS loaded")
except Exception:
    TTS = False
    _tts_engine = None


def auto_log(pid, audio_path):
    """Transcribe a recorded voice memo and save it as a memory. Optionally
    summarized by an LLM if OPENAI_API_KEY is set; otherwise the raw
    transcript is stored as-is."""
    _whisper_ready.wait()          # a memo recorded right after startup waits for the model
    if not WHISPER or _whisper_model is None:
        return
    try:
        res = _whisper_model.transcribe(audio_path)
        transcript = res.get("text", "").strip()
        if not transcript:
            return
        summary = transcript
        if OPENAI and os.environ.get("OPENAI_API_KEY"):
            try:
                client = openai.OpenAI()
                r = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content":
                        f"Summarize in one gentle sentence for Alzheimer's memory aid:\n{transcript}"}],
                    max_tokens=80)
                summary = r.choices[0].message.content.strip()
            except Exception as e:
                print(f"LLM error: {e}")
        with get_db() as c:
            c.execute(
                "INSERT INTO memories (person_id,summary,raw_transcript,source) VALUES(?,?,?,?)",
                (pid, summary, transcript, "whisper"))
        print(f"✅ Memory auto-logged for {pid}")
    except Exception as e:
        print(f"Whisper error: {e}")


def speak_greeting(pid):
    """Speak a person's greeting via TTS, in a background thread so it
    never blocks recognition."""
    if not TTS:
        return
    import threading
    with get_db() as c:
        p = c.execute(
            "SELECT name,tts_greeting FROM people WHERE id=?", (pid,)
        ).fetchone()
    if not p:
        return
    msg = p["tts_greeting"] or f"Hello {p['name']}, good to see you!"

    def _speak():
        try:
            _tts_engine.say(msg)
            _tts_engine.runAndWait()
        except Exception:
            pass

    threading.Thread(target=_speak, daemon=True).start()