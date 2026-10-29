import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, NotebookPen, Square } from "lucide-react";
import { api } from "@/api/client";
import { Alert, Button, Card, Modal, TextAreaField } from "@/components/ui";

const MAX_RECORDING_S = 300;

interface Draft {
  personId: string;
  name: string;
}

/**
 * For visitors/caregivers at the patient's side: add a note or (when the
 * server has Whisper) record a voice memo. The note is bound to the person
 * who was recognised when it was started, so it can never be saved against
 * a different visitor who walks in mid-way.
 */
export function VisitorNotes({
  personId,
  name,
  voiceAvailable,
  onBusyChange,
}: {
  personId: string;
  name: string;
  voiceAvailable: boolean;
  /** True while there's unsaved text or a recording in progress — the
   *  parent keeps this panel mounted even if the visitor leaves the frame. */
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFor, setDraftFor] = useState<Draft>({ personId, name });
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const busy = Boolean(text.trim()) || recording || saving;

  // A new visitor and nothing in progress: re-bind the form to them.
  useEffect(() => {
    if (!busy) setDraftFor({ personId, name });
  }, [personId, name, busy]);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const first = draftFor.name.split(" ")[0];

  async function save() {
    const summary = text.trim();
    if (!summary) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.saveMemory(draftFor.personId, summary);
      setText("");
      setMessage({ tone: "success", text: `Saved. ${first} will see this next time.` });
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="visitor-notes"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left text-lg font-semibold text-ink hover:bg-paper sm:px-8"
      >
        <span className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5" aria-hidden="true" />
          For visitors: add a note about today
        </span>
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="visitor-notes" className="space-y-4 border-t border-line px-6 py-5 sm:px-8">
          <TextAreaField
            label={`What did you talk about with ${first}?`}
            hint={draftFor.personId !== personId ? `This note will be saved for ${draftFor.name}.` : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={3}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} loading={saving} disabled={!text.trim()}>
              Save note
            </Button>
            {voiceAvailable && (
              <VoiceMemo
                personId={draftFor.personId}
                name={draftFor.name}
                onResult={setMessage}
                onActiveChange={setRecording}
              />
            )}
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
        </div>
      )}
    </Card>
  );
}

type RecState = "idle" | "consent" | "recording" | "uploading";

function VoiceMemo({
  personId,
  name,
  onResult,
  onActiveChange,
}: {
  personId: string;
  name: string;
  onResult: (m: { tone: "success" | "error"; text: string }) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [state, setState] = useState<RecState>("idle");
  useEffect(() => onActiveChange(state === "recording" || state === "uploading"), [state, onActiveChange]);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const boundTo = useRef(personId);
  const discard = useRef(false);

  // Always release the microphone if this component goes away mid-recording.
  useEffect(
    () => () => {
      discard.current = true;
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => {
    if (state === "recording" && elapsed >= MAX_RECORDING_S) stop();
  }, [elapsed, state]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setState("idle");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      boundTo.current = personId;
      discard.current = false;
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = upload;
      recorder.current = rec;
      rec.start();
      setElapsed(0);
      setState("recording");
    } catch {
      onResult({ tone: "error", text: "The microphone isn't available. Please allow microphone access and try again." });
    }
  }

  function stop(cancel = false) {
    discard.current = cancel;
    recorder.current?.stop();
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function upload() {
    if (discard.current) {
      setState("idle");
      return;
    }
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    if (!blob.size) {
      setState("idle");
      onResult({ tone: "error", text: "Nothing was recorded. Please try again." });
      return;
    }
    setState("uploading");
    try {
      await api.uploadAudio(boundTo.current, blob);
      onResult({ tone: "success", text: `Recording received. It's being turned into a note for ${name}.` });
    } catch (err) {
      onResult({ tone: "error", text: (err as Error).message });
    } finally {
      setState("idle");
    }
  }

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <>
      {state === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="inline-flex items-center gap-2 font-semibold text-danger-700">
            <span className="h-3 w-3 animate-pulse rounded-full bg-danger-600" aria-hidden="true" />
            Recording {mmss}
          </span>
          <Button variant="danger" icon={<Square className="h-4 w-4" aria-hidden="true" />} onClick={() => stop()}>
            Stop and save
          </Button>
          <Button variant="ghost" onClick={() => stop(true)}>
            Discard
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          loading={state === "uploading"}
          icon={<Mic className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setState("consent")}
        >
          Record a voice memo
        </Button>
      )}
      <Modal
        open={state === "consent"}
        title="Record this conversation?"
        onClose={() => setState("idle")}
        description={
          <>
            <p>
              The microphone will record until you press <strong>Stop</strong> (at most 5 minutes). The recording is
              sent to the Memory Assistant, turned into a written note for {name}, and kept on the server.
            </p>
            <p className="mt-2">Please make sure everyone taking part is happy to be recorded.</p>
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setState("idle")} autoFocus>
              Cancel
            </Button>
            <Button variant="danger" icon={<Mic className="h-4 w-4" aria-hidden="true" />} onClick={start}>
              Everyone agrees — start recording
            </Button>
          </>
        }
      />
    </>
  );
}
