import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Square, Trash2, Volume2 } from "lucide-react";
import { api } from "@/api/client";
import type { Memory } from "@/api/types";
import { Alert, Badge, Button, ConfirmDialog } from "@/components/ui";
import { formatDateTime, parseServerTime } from "@/lib/format";
import { useSpeech, type Speech } from "@/features/patient/useSpeech";
import { sourceLabel } from "./components";

/**
 * One memory, the way a caregiver manages it: who and when, the words the
 * patient will see and hear (editable), an optional voice-memo transcript,
 * a preview read-aloud, and delete behind a confirmation.
 */
export function MemoryCard({
  memory,
  showPerson,
  speech,
  onUpdated,
  onDelete,
}: {
  memory: Memory;
  showPerson: boolean;
  speech: Speech;
  onUpdated: (m: Memory) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.summary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const speechId = `memory:${memory.id}`;
  const speaking = speech.speakingId === speechId;

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  async function save() {
    const summary = text.trim();
    if (!summary) {
      setError("Please write the memory first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onUpdated(await api.updateMemory(memory.id, summary));
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const when = formatDateTime(memory.created_at);
  const fieldId = `memory-edit-${memory.id}`;

  return (
    <article className="rounded-3xl border border-line bg-card p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        {showPerson && (
          <Link to={`/caregiver/people/${memory.person_id}`} className="font-semibold text-sage-700 hover:underline">
            {memory.person_name}
          </Link>
        )}
        <time dateTime={parseServerTime(memory.created_at)?.toISOString()}>{when}</time>
        <Badge tone={memory.source === "whisper" ? "info" : "neutral"}>{sourceLabel(memory.source)}</Badge>
      </header>

      {editing ? (
        <div className="mt-3 space-y-3">
          <label htmlFor={fieldId} className="sr-only">
            Edit memory from {when}
          </label>
          <textarea
            id={fieldId}
            ref={editRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={4000}
            aria-invalid={error ? true : undefined}
            className="block w-full resize-y rounded-2xl border border-line-strong bg-card px-3.5 py-2.5 text-[16px] leading-relaxed text-ink"
          />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} loading={saving}>
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setText(memory.summary);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-line font-serif text-xl leading-relaxed text-ink">{memory.summary}</p>
      )}

      {memory.raw_transcript && memory.raw_transcript !== memory.summary && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-primary-700">Original voice-memo transcript</summary>
          <p className="mt-1 whitespace-pre-line text-ink-muted">{memory.raw_transcript}</p>
        </details>
      )}

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {speech.supported &&
            (speaking ? (
              <Button size="sm" variant="secondary" icon={<Square className="h-4 w-4" aria-hidden="true" />} onClick={speech.stop}>
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => speech.speak(memory.summary, speechId)}
                aria-label={`Listen to the memory from ${when}`}
              >
                Listen
              </Button>
            ))}
          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing(true)}>
            Edit<span className="sr-only"> memory from {when}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger-700 hover:bg-danger-50"
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            onClick={onDelete}
          >
            Delete<span className="sr-only"> memory from {when}</span>
          </Button>
        </div>
      )}
    </article>
  );
}

/** A list of MemoryCards with one shared voice and one delete confirmation. */
export function MemoryTimeline({
  memories,
  showPerson,
  onDeleted,
  onUpdated,
}: {
  memories: Memory[];
  showPerson: boolean;
  onDeleted: (id: number) => void;
  onUpdated: (m: Memory) => void;
}) {
  const speech = useSpeech();
  const [toDelete, setToDelete] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMemory(toDelete.id);
      if (speech.speakingId === `memory:${toDelete.id}`) speech.stop();
      onDeleted(toDelete.id);
      setToDelete(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!memories.length) return <p className="text-[15px] text-ink-muted">No memories saved yet.</p>;

  return (
    <>
      <ul className="space-y-4">
        {memories.map((m) => (
          <li key={m.id}>
            <MemoryCard memory={m} showPerson={showPerson} speech={speech} onUpdated={onUpdated} onDelete={() => setToDelete(m)} />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this memory?"
        description={
          <>
            <span className="block">
              “{toDelete?.summary.slice(0, 160)}
              {(toDelete?.summary.length ?? 0) > 160 ? "…" : ""}”
            </span>
            <span className="mt-2 block">It will no longer be shown to the patient. This can't be undone.</span>
          </>
        }
        confirmLabel="Delete memory"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={() => {
          setToDelete(null);
          setError(null);
        }}
      />
    </>
  );
}
