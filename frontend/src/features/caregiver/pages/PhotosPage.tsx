import { useMemo, useState, type FormEvent } from "react";
import { Images, Pencil, Trash2, Upload } from "lucide-react";
import { api } from "@/api/client";
import type { FamilyPhoto, Memory, Person, PhotoDetailsInput } from "@/api/types";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  TextAreaField,
  TextField,
} from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatShortDate } from "@/lib/format";
import { PageHeader, PhotoPicker } from "../components";

const EMPTY: PhotoDetailsInput = { caption: "", story: "", taken_on: "", memory_id: null, person_ids: [] };

const select = "block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] text-ink";

/** Caption, story, date, who is in it, and which memory it illustrates. */
function PhotoDetailsFields({
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
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <TextField
          label="Caption"
          placeholder="e.g. Whitby beach"
          value={value.caption}
          onChange={(e) => set("caption", e.target.value)}
          maxLength={200}
        />
        <TextField
          label="When (roughly)"
          placeholder="e.g. Summer 1998"
          hint="Any wording is fine."
          value={value.taken_on}
          onChange={(e) => set("taken_on", e.target.value)}
          maxLength={20}
        />
      </div>
      <TextAreaField
        label="The story behind it"
        hint="A few warm sentences, read aloud to the patient. Avoid questions that test memory."
        placeholder="e.g. A sunny day by the sea. You built a sandcastle with Sarah."
        value={value.story}
        onChange={(e) => set("story", e.target.value)}
        rows={3}
        maxLength={4000}
      />
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
                  className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-[15px] ${
                    checked ? "border-primary-700 bg-primary-50 font-semibold text-primary-800" : "border-line-strong bg-card text-ink"
                  }`}
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

function UploadCard({ people, memories, onUploaded }: { people: Person[]; memories: Memory[]; onUploaded: (p: FamilyPhoto[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [details, setDetails] = useState<PhotoDetailsInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setMessage({ tone: "error", text: "Choose at least one photo." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.uploadPhotos(files, details);
      onUploaded(res.photos);
      setFiles([]);
      setDetails(EMPTY);
      setMessage(
        res.rejected.length
          ? { tone: "warning", text: `${res.photos.length} added. ${res.rejected.map((r) => r.filename).join(", ")} couldn't be read (use JPG or PNG).` }
          : { tone: "success", text: `${res.photos.length} photo${res.photos.length === 1 ? "" : "s"} added to the album.` },
      );
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Add family photos" description="Shared with the patient in Memories and on each person's page." />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <PhotoPicker
            files={files}
            onChange={setFiles}
            label="Photos"
            hint="Any family photos — places, gatherings, pets. Location data is removed when they're saved."
          />
          <PhotoDetailsFields value={details} onChange={setDetails} people={people} memories={memories} idPrefix="upload" />
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button type="submit" loading={busy} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
            Add to album
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function PhotosPage() {
  const photos = useAsync(() => api.photos(), []);
  const people = useAsync(() => api.people(), []);
  const memories = useAsync(() => api.memories(), []);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<FamilyPhoto | null>(null);
  const [draft, setDraft] = useState<PhotoDetailsInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<FamilyPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shown = useMemo(
    () => (photos.data ?? []).filter((p) => !filter || p.people.some((x) => x.id === filter)),
    [photos.data, filter],
  );

  function startEdit(p: FamilyPhoto) {
    setEditing(p);
    setEditError(null);
    setDraft({ caption: p.caption, story: p.story, taken_on: p.taken_on, memory_id: p.memory_id, person_ids: p.people.map((x) => x.id) });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await api.updatePhoto(editing.id, draft);
      photos.setData((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)));
      setEditing(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePhoto(toDelete.id);
      photos.setData((prev) => (prev ?? []).filter((p) => p.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Family photos"
        description="Photos are the heart of reminiscence. Add a caption and a short story so they can be read aloud."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="album-heading" className="order-2 xl:order-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="album-heading" className="text-lg font-semibold text-ink">
              Album {photos.data && <span className="font-sans text-base font-normal text-ink-muted">({shown.length})</span>}
            </h2>
            {(people.data?.length ?? 0) > 0 && (
              <div className="w-56">
                <label htmlFor="photo-filter" className="sr-only">
                  Show photos of
                </label>
                <select id="photo-filter" className={select} value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">Everyone</option>
                  {people.data!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {photos.error ? (
            <ErrorState message={photos.error.message} onRetry={photos.reload} />
          ) : !photos.data ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-72 rounded-2xl" />
              ))}
            </div>
          ) : !shown.length ? (
            <Card>
              <EmptyState
                icon={<Images className="h-6 w-6" aria-hidden="true" />}
                title={photos.data.length ? "No photos of this person yet" : "The album is empty"}
                description="Add a few family photos with a short story — they make gentle conversation starters."
              />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {shown.map((p) => (
                <li key={p.id}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <div className="aspect-[4/3] bg-paper">
                      <img src={api.photoUrl(p.id)} alt={p.caption || "Family photo"} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <h3 className="font-serif text-lg font-semibold text-ink">{p.caption || "Untitled photo"}</h3>
                      {p.taken_on && <p className="text-sm text-ink-muted">{p.taken_on}</p>}
                      {p.story && <p className="line-clamp-3 text-[15px] text-ink">{p.story}</p>}
                      <p className="text-sm text-ink-muted">
                        {p.people.length ? `With ${p.people.map((x) => x.name).join(", ")}` : "No one tagged"}
                        {p.memory_id ? " · linked to a memory" : ""}
                      </p>
                      <div className="mt-auto flex gap-2 pt-3">
                        <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => startEdit(p)}>
                          Edit<span className="sr-only"> {p.caption || "photo"}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-danger-700 hover:bg-danger-50"
                          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => setToDelete(p)}
                        >
                          Delete<span className="sr-only"> {p.caption || "photo"}</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="order-1 xl:order-2">
          {people.error ? (
            <ErrorState message={people.error.message} onRetry={people.reload} />
          ) : (
            <UploadCard
              people={people.data ?? []}
              memories={memories.data ?? []}
              onUploaded={(added) => photos.setData((prev) => [...added, ...(prev ?? [])])}
            />
          )}
        </div>
      </div>

      <Modal
        open={editing !== null}
        title="Edit photo details"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <img src={api.photoUrl(editing.id)} alt="" className="max-h-48 w-full rounded-xl object-cover" />
            <PhotoDetailsFields value={draft} onChange={setDraft} people={people.data ?? []} memories={memories.data ?? []} idPrefix="edit" />
            {editError && <Alert tone="error">{editError}</Alert>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this photo?"
        description={
          <>
            “{toDelete?.caption || "Untitled photo"}” will be removed from the album
            {toDelete?.memory_id ? " and from the memory it illustrates" : ""}. If it's someone's profile photo, their
            picture goes back to the default. This can't be undone.
          </>
        }
        confirmLabel="Delete photo"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setToDelete(null);
          setDeleteError(null);
        }}
      />
    </>
  );
}
