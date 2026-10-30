import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Upload } from "lucide-react";
import { ApiError, api, type UploadProgress } from "@/api/client";
import {
  PHOTO_CATEGORIES,
  type FamilyPhoto,
  type Memory,
  type Person,
  type PhotoCategory,
  type PhotoDetailsInput,
  type UploadRejection,
} from "@/api/types";
import { Alert, Avatar, Button, Modal, TextAreaField, TextField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { PhotoPicker } from "../components";

export const EMPTY_DETAILS: PhotoDetailsInput = {
  caption: "",
  story: "",
  taken_on: "",
  location: "",
  category: "",
  prompt: "",
  memory_id: null,
  person_ids: [],
};

export function detailsFrom(p: FamilyPhoto): PhotoDetailsInput {
  return {
    caption: p.caption,
    story: p.story,
    taken_on: p.taken_on,
    location: p.location,
    category: p.category,
    prompt: p.prompt,
    memory_id: p.memory_id,
    person_ids: p.people.map((x) => x.id),
  };
}

export const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  family: "Family",
  celebration: "Celebration",
  holiday: "Holiday",
  home: "Home",
  friends: "Friends",
  everyday: "Everyday moments",
};

/** Same limits as the server (album_api.py); the server checks again. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_MB = 15;

export const REJECTION_MESSAGES: Record<UploadRejection, string> = {
  unsupported_type: "Not a supported photo type. Use JPG, PNG or WebP.",
  too_large: `Larger than ${MAX_FILE_MB} MB. Try a smaller copy of the photo.`,
  invalid_image: "The file couldn't be read as a photo. It may be damaged.",
};

/** A file the browser can already tell won't be accepted, or null. */
export function precheck(file: File): UploadRejection | null {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return "too_large";
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return "unsupported_type";
  return null;
}

const select = "block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] text-ink";

/** Caption, date, place, story, prompt, category, who is in it, and which memory it illustrates. */
export function PhotoDetailsFields({
  value,
  onChange,
  people,
  memories,
  idPrefix,
}: {
  value: PhotoDetailsInput;
  onChange: (v: PhotoDetailsInput) => void;
  people: Person[];
  memories: Memory[];
  idPrefix: string;
}) {
  const set = <K extends keyof PhotoDetailsInput>(k: K, v: PhotoDetailsInput[K]) => onChange({ ...value, [k]: v });
  // Offer memories of the people in the photo first; all memories if nobody is tagged.
  const relevant = value.person_ids.length ? memories.filter((m) => value.person_ids.includes(m.person_id)) : memories;
  const linked = memories.find((m) => m.id === value.memory_id);
  const options = linked && !relevant.includes(linked) ? [linked, ...relevant] : relevant;

  return (
    <div className="space-y-5">
      <TextField
        label="Title"
        placeholder="e.g. Sandcastles at Whitby"
        value={value.caption}
        onChange={(e) => set("caption", e.target.value)}
        maxLength={200}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="When (roughly)"
          placeholder="e.g. Summer 1998"
          hint="Only if you know it. Any wording is fine."
          value={value.taken_on}
          onChange={(e) => set("taken_on", e.target.value)}
          maxLength={20}
        />
        <TextField
          label="Where"
          placeholder="e.g. Whitby"
          hint="Only if you know it."
          value={value.location}
          onChange={(e) => set("location", e.target.value)}
          maxLength={200}
        />
      </div>
      <TextAreaField
        label="The story behind it"
        hint="A few warm sentences, read aloud to the patient. Only what you know to be true."
        placeholder="e.g. A sunny day by the sea. You built a sandcastle with Sarah."
        value={value.story}
        onChange={(e) => set("story", e.target.value)}
        rows={3}
        maxLength={4000}
      />
      <TextField
        label="Conversation prompt (optional)"
        hint="A gentle invitation, never a test, e.g. “Would you like to hear about the pier?”"
        value={value.prompt}
        onChange={(e) => set("prompt", e.target.value)}
        maxLength={300}
      />
      <div>
        <label htmlFor={`${idPrefix}-category`} className="mb-1.5 block text-sm font-semibold text-ink">
          Kind of moment <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <select
          id={`${idPrefix}-category`}
          className={select}
          value={value.category}
          onChange={(e) => set("category", e.target.value as PhotoCategory | "")}
        >
          <option value="">Not set</option>
          {PHOTO_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Who is in this photo?</legend>
        {people.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {people.map((p) => {
              const checked = value.person_ids.includes(p.id);
              return (
                <label
                  key={p.id}
                  htmlFor={`${idPrefix}-p-${p.id}`}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-700",
                    checked ? "border-primary-700 bg-primary-50 font-semibold text-primary-800" : "border-line-strong bg-card text-ink",
                  )}
                >
                  <input
                    id={`${idPrefix}-p-${p.id}`}
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() =>
                      set("person_ids", checked ? value.person_ids.filter((x) => x !== p.id) : [...value.person_ids, p.id])
                    }
                  />
                  <Avatar name={p.name} size="sm" src={p.photo_count || p.profile_photo_id ? api.personPhotoUrl(p.id) : null} />
                  {p.name}
                  {checked && <span className="sr-only">(selected)</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">Add people first to tag them in photos.</p>
        )}
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-memory`} className="mb-1.5 block text-sm font-semibold text-ink">
          Show with a memory <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <select
          id={`${idPrefix}-memory`}
          className={select}
          value={value.memory_id ?? ""}
          onChange={(e) => set("memory_id", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Not linked to a memory</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.person_name}: {m.summary.slice(0, 60)}
              {m.summary.length > 60 ? "…" : ""} ({formatShortDate(m.created_at)})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type FileResult = { name: string; ok: true } | { name: string; ok: false; reason: string };

export type UploadOne = (
  file: File,
  details: PhotoDetailsInput,
  onProgress: UploadProgress,
  signal: AbortSignal,
) => Promise<{ photos: FamilyPhoto[]; rejected: Array<{ filename: string; status: UploadRejection }> }>;

/**
 * Choose photos, describe them once, and upload them one at a time with a
 * real progress bar and a result for every file. Files the browser can
 * already tell are unsuitable are refused before upload; the server checks
 * every file again.
 */
export function PhotoUploader({
  people,
  memories,
  uploadOne,
  onUploaded,
  submitLabel = "Upload photos",
  idPrefix = "upload",
}: {
  people: Person[];
  memories: Memory[];
  uploadOne: UploadOne;
  onUploaded: (photos: FamilyPhoto[]) => void;
  submitLabel?: string;
  idPrefix?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [details, setDetails] = useState<PhotoDetailsInput>(EMPTY_DETAILS);
  const [progress, setProgress] = useState<{ index: number; count: number; fraction: number } | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setError("Choose at least one photo.");
      return;
    }
    setError(null);
    setResults([]);
    const controller = new AbortController();
    abort.current = controller;
    const done: FileResult[] = [];
    const added: FamilyPhoto[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const local = precheck(file);
        if (local) {
          done.push({ name: file.name, ok: false, reason: REJECTION_MESSAGES[local] });
          continue;
        }
        setProgress({ index: i, count: files.length, fraction: 0 });
        const res = await uploadOne(
          file,
          details,
          (loaded, total) => setProgress({ index: i, count: files.length, fraction: total ? loaded / total : 0 }),
          controller.signal,
        );
        added.push(...res.photos);
        const rejected = res.rejected[0];
        done.push(rejected ? { name: file.name, ok: false, reason: REJECTION_MESSAGES[rejected.status] } : { name: file.name, ok: true });
      }
      setFiles([]);
      setDetails(EMPTY_DETAILS);
    } catch (err) {
      if ((err as Error).name === "AbortError") setError("Upload stopped. Photos already uploaded were kept.");
      else setError(err instanceof ApiError ? err.message : "The upload failed. Please try again.");
      // Keep the files that weren't uploaded yet, so trying again is one click.
      setFiles((prev) => prev.slice(done.length));
    } finally {
      abort.current = null;
      setProgress(null);
      setResults(done);
      if (added.length) onUploaded(added);
    }
  }

  const busy = progress !== null;
  const percent = progress ? Math.round(((progress.index + progress.fraction) / progress.count) * 100) : 0;
  const okCount = results.filter((r) => r.ok).length;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate aria-busy={busy}>
      <PhotoPicker
        id={`${idPrefix}-files`}
        files={files}
        onChange={(f) => {
          setFiles(f);
          setError(null);
        }}
        label="Photos"
        accept={ACCEPTED_TYPES.join(",")}
        hint={`JPG, PNG or WebP, up to ${MAX_FILE_MB} MB each. Location data is removed when they're saved.`}
      />
      <PhotoDetailsFields value={details} onChange={setDetails} people={people} memories={memories} idPrefix={idPrefix} />
      {files.length > 1 && <p className="text-sm text-ink-muted">These details are given to all {files.length} photos. You can edit each one afterwards.</p>}

      {busy && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-ink">
              Uploading photo {progress.index + 1} of {progress.count}
            </span>
            <span className="text-ink-muted">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2.5 overflow-hidden rounded-full bg-sage-100"
          >
            <div className="h-full rounded-full bg-sage-700 transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div role="status" className="space-y-2">
          <p className="text-[15px] font-semibold text-ink">
            {okCount} of {results.length} photo{results.length === 1 ? "" : "s"} added.
          </p>
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-start gap-2 text-sm">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-700" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                )}
                <span>
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="text-ink-muted"> — {r.ok ? "added" : r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
          {submitLabel}
        </Button>
        {busy && (
          <Button variant="secondary" onClick={() => abort.current?.abort()}>
            Stop uploading
          </Button>
        )}
      </div>
    </form>
  );
}

/** Edit one photo's details in a dialog. */
export function PhotoEditModal({
  photo,
  people,
  memories,
  onClose,
  onSaved,
}: {
  photo: FamilyPhoto | null;
  people: Person[];
  memories: Memory[];
  onClose: () => void;
  onSaved: (p: FamilyPhoto) => void;
}) {
  const [draft, setDraft] = useState<PhotoDetailsInput>(EMPTY_DETAILS);
  const [forId, setForId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (photo && forId !== photo.id) {
    setForId(photo.id);
    setDraft(detailsFrom(photo));
    setError(null);
  }

  async function save() {
    if (!photo) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updatePhoto(photo.id, draft));
      setForId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={photo !== null}
      title="Edit photo details"
      onClose={() => {
        setForId(null);
        onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      {photo && (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <img src={api.photoUrl(photo.id, "thumb")} alt="" className="max-h-48 w-full rounded-xl object-cover" />
          <PhotoDetailsFields value={draft} onChange={setDraft} people={people} memories={memories} idPrefix="edit" />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
