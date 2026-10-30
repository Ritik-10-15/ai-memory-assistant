import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, FolderMinus, ImagePlus, Pencil, Star, Trash2 } from "lucide-react";
import { api, ApiError } from "@/api/client";
import type { AlbumDetail, FamilyPhoto } from "@/api/types";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
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
import { cn } from "@/lib/cn";
import { PageHeader } from "../components";
import { AlbumTabs } from "../photos/AlbumTabs";
import { CATEGORY_LABELS, PhotoEditModal, PhotoUploader } from "../photos/PhotoFields";
import { VisibleToPatientField } from "./AlbumsPage";

function photoTitle(p: FamilyPhoto) {
  return p.caption || "Untitled photo";
}

/** Move one item and return the new order (pure, for testing). */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function DetailsCard({ detail, onSaved }: { detail: AlbumDetail; onSaved: (d: AlbumDetail) => void }) {
  const { album } = detail;
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description);
  const [visible, setVisible] = useState(album.visible_to_patient);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please give the album a name.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await api.updateAlbum(album.id, { title: title.trim(), description: description.trim(), visible_to_patient: visible }));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader title="Album details" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <TextField
            label="Album name"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
            maxLength={120}
            error={error}
            required
          />
          <TextAreaField
            label="Description (optional)"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setSaved(false);
            }}
            rows={3}
            maxLength={2000}
          />
          <VisibleToPatientField
            id="album-visible"
            checked={visible}
            onChange={(v) => {
              setVisible(v);
              setSaved(false);
            }}
          />
          {saved && <Alert tone="success">Album details saved.</Alert>}
          <Button type="submit" loading={busy}>
            Save details
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Choose photos from the library that aren't in this album yet. */
function LibraryPicker({ albumId, inAlbum, onAdded }: { albumId: string; inAlbum: Set<string>; onAdded: (d: AlbumDetail) => void }) {
  const [open, setOpen] = useState(false);
  const library = useAsync(() => (open ? api.photos() : Promise.resolve(null)), [open]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = (library.data ?? []).filter((p) => !inAlbum.has(p.id));

  function close() {
    setOpen(false);
    setChosen([]);
    setError(null);
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.addToAlbum(albumId, chosen));
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen(true)}>
        Add from all photos
      </Button>
      <Modal
        open={open}
        title="Add photos you've already uploaded"
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={add} loading={busy} disabled={!chosen.length}>
              {chosen.length ? `Add ${chosen.length} photo${chosen.length === 1 ? "" : "s"}` : "Add photos"}
            </Button>
          </>
        }
      >
        {library.error ? (
          <ErrorState message={library.error.message} onRetry={library.reload} />
        ) : !library.data ? (
          <Skeleton className="h-40" />
        ) : !available.length ? (
          <p className="text-[15px] text-ink-muted">Every uploaded photo is already in this album.</p>
        ) : (
          <fieldset className="max-h-[50vh] overflow-y-auto pr-1">
            <legend className="sr-only">Photos to add</legend>
            <ul className="grid grid-cols-2 gap-3">
              {available.map((p) => {
                const checked = chosen.includes(p.id);
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "block cursor-pointer rounded-2xl border-2 p-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-700",
                        checked ? "border-primary-700 bg-primary-50" : "border-transparent",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => setChosen((c) => (checked ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                      />
                      <img src={api.photoUrl(p.id, "thumb")} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
                      <span className="mt-1 block truncate text-sm font-medium text-ink">
                        {photoTitle(p)}
                        {checked && <span className="sr-only"> (selected)</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      </Modal>
    </>
  );
}

export function AlbumEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const created = (location.state as { created?: boolean } | null)?.created;
  const detail = useAsync(() => api.careAlbum(id), [id]);
  const people = useAsync(() => api.people(), []);
  const memories = useAsync(() => api.memories(), []);

  const [editing, setEditing] = useState<FamilyPhoto | null>(null);
  const [toDelete, setToDelete] = useState<FamilyPhoto | null>(null);
  const [deleteAlbum, setDeleteAlbum] = useState(false);
  const [alsoPhotos, setAlsoPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  // After a move, keep keyboard focus on the same control of the moved photo.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    if (!focusAfter.current) return;
    const el = document.getElementById(focusAfter.current);
    focusAfter.current = null;
    el?.focus();
  });

  const set = (d: AlbumDetail) => detail.setData(() => d);

  async function run(action: () => Promise<AlbumDetail>, message?: string) {
    setActionError(null);
    try {
      set(await action());
      if (message) setAnnounce(message);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const back = (
    <ButtonLink to="/caregiver/albums" variant="ghost" size="sm" className="-ml-3 mb-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
      All albums
    </ButtonLink>
  );

  if (detail.error) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        {back}
        <PageHeader title={missing ? "Album not found" : "Album"} />
        {missing ? <Alert tone="warning">This album may have been deleted.</Alert> : <ErrorState message={detail.error.message} onRetry={detail.reload} />}
      </>
    );
  }
  if (!detail.data) {
    return (
      <div aria-busy="true">
        {back}
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const { album, photos } = detail.data;
  const ids = photos.map((p) => p.id);
  const onlyHere = photos.filter((p) => (p.albums ?? []).length <= 1).length;

  function move(index: number, delta: number, direction: "up" | "down") {
    const next = moved(ids, index, index + delta);
    focusAfter.current = `move-${direction}-${ids[index]}`;
    void run(() => api.orderAlbum(album.id, next), `${photoTitle(photos[index])} moved to position ${index + delta + 1} of ${ids.length}.`);
  }

  async function confirmDeletePhoto() {
    if (!toDelete) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deletePhoto(toDelete.id);
      detail.setData((prev) =>
        prev
          ? {
              album: { ...prev.album, photo_count: prev.album.photo_count - 1, cover_photo_id: prev.album.cover_photo_id === toDelete.id ? null : prev.album.cover_photo_id },
              photos: prev.photos.filter((p) => p.id !== toDelete.id),
            }
          : prev,
      );
      setToDelete(null);
      detail.reload();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteAlbum() {
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteAlbum(album.id, alsoPhotos);
      navigate("/caregiver/albums", { replace: true });
    } catch (err) {
      setActionError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      {back}
      <PageHeader
        title={album.title}
        description={album.description || undefined}
        actions={
          album.visible_to_patient ? (
            <ButtonLink to={`/albums/${album.id}`} variant="secondary" icon={<Eye className="h-4 w-4" aria-hidden="true" />}>
              View as the patient sees it
            </ButtonLink>
          ) : undefined
        }
      />
      <AlbumTabs />
      {created && <Alert tone="success" className="mb-6">Album created. Now add some photos.</Alert>}
      <div className="mb-6 flex flex-wrap items-center gap-3 text-[15px] text-ink-muted">
        <span>
          {album.photo_count} photo{album.photo_count === 1 ? "" : "s"}
        </span>
        {album.visible_to_patient ? <Badge tone="success">Shown to the patient</Badge> : <Badge tone="warning">Hidden from the patient</Badge>}
      </div>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      {actionError && (
        <Alert tone="error" className="mb-6">
          {actionError}
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="album-photos-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="album-photos-heading" className="font-serif text-3xl text-ink">
              Photos in this album
            </h2>
            <LibraryPicker albumId={album.id} inAlbum={new Set(ids)} onAdded={set} />
          </div>
          {!photos.length ? (
            <Card className="rounded-3xl">
              <EmptyState
                icon={<ImagePlus className="h-6 w-6" aria-hidden="true" />}
                title="This album is empty"
                description="Upload photos, or add ones you've already uploaded."
              />
            </Card>
          ) : (
            <ol className="space-y-3">
              {photos.map((p, i) => {
                const isCover = album.cover_photo_id === p.id;
                const title = photoTitle(p);
                return (
                  <li key={p.id} className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4 shadow-card sm:flex-row">
                    <img
                      src={api.photoUrl(p.id, "thumb")}
                      alt={title}
                      loading="lazy"
                      className="aspect-[4/3] w-full shrink-0 rounded-2xl object-cover sm:w-44"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-muted">{i + 1}.</span>
                        <h3 className="font-serif text-xl text-ink">{title}</h3>
                        {isCover && <Badge tone="info">Cover</Badge>}
                        {p.category && <Badge>{CATEGORY_LABELS[p.category]}</Badge>}
                      </div>
                      {(p.taken_on || p.location) && <p className="text-sm text-ink-muted">{[p.taken_on, p.location].filter(Boolean).join(" · ")}</p>}
                      {p.story && <p className="line-clamp-2 text-[15px] text-ink">{p.story}</p>}
                      <p className="text-sm text-ink-muted">
                        {p.people.length ? `With ${p.people.map((x) => x.name).join(", ")}` : "No one tagged"}
                        {p.memory ? " · linked to a memory" : ""}
                        {p.prompt ? " · has a conversation prompt" : ""}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          id={`move-up-${p.id}`}
                          size="sm"
                          variant="secondary"
                          disabled={i === 0}
                          icon={<ArrowUp className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => move(i, -1, "up")}
                        >
                          Up<span className="sr-only">: move {title} earlier</span>
                        </Button>
                        <Button
                          id={`move-down-${p.id}`}
                          size="sm"
                          variant="secondary"
                          disabled={i === photos.length - 1}
                          icon={<ArrowDown className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => move(i, 1, "down")}
                        >
                          Down<span className="sr-only">: move {title} later</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-pressed={isCover && album.cover_chosen}
                          icon={<Star className="h-4 w-4" aria-hidden="true" />}
                          onClick={() =>
                            run(() => api.updateAlbum(album.id, { cover_photo_id: isCover && album.cover_chosen ? null : p.id }), "Album cover updated.")
                          }
                        >
                          {isCover && album.cover_chosen ? "Cover photo" : "Use as cover"}
                          <span className="sr-only"> ({title})</span>
                        </Button>
                        <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing(p)}>
                          Edit<span className="sr-only"> {title}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<FolderMinus className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => run(() => api.removeFromAlbum(album.id, p.id), `${title} removed from this album. It's still in All photos.`)}
                        >
                          Remove<span className="sr-only"> {title} from this album</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-700 hover:bg-danger-50"
                          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => setToDelete(p)}
                        >
                          Delete<span className="sr-only"> {title}</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <Card className="rounded-3xl">
            <CardHeader title="Upload photos" description="Each photo is checked on the server; location data is removed." />
            <CardBody>
              <PhotoUploader
                idPrefix="album-upload"
                people={people.data ?? []}
                memories={memories.data ?? []}
                submitLabel="Upload to this album"
                uploadOne={async (file, d, onProgress, signal) => {
                  const before = new Set(ids);
                  const res = await api.uploadToAlbum(album.id, [file], d, onProgress, signal);
                  set({ album: res.album, photos: res.photos });
                  return { photos: res.photos.filter((x) => !before.has(x.id)), rejected: res.rejected };
                }}
                onUploaded={(added) => setAnnounce(`${added.length} photo${added.length === 1 ? "" : "s"} added to ${album.title}.`)}
              />
            </CardBody>
          </Card>
          <DetailsCard key={album.id} detail={detail.data} onSaved={set} />
          <Card className="rounded-3xl">
            <CardHeader title="Delete album" />
            <CardBody className="space-y-3">
              <p className="text-[15px] text-ink-muted">Photos stay in “All photos” unless you choose to delete them too.</p>
              <Button
                variant="ghost"
                className="text-danger-700 hover:bg-danger-50"
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  setAlsoPhotos(false);
                  setDeleteAlbum(true);
                }}
              >
                Delete this album
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <PhotoEditModal
        photo={editing}
        people={people.data ?? []}
        memories={memories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          detail.setData((prev) => (prev ? { ...prev, photos: prev.photos.map((x) => (x.id === updated.id ? updated : x)) } : prev));
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this photo?"
        description={
          <>
            “{toDelete ? photoTitle(toDelete) : ""}” will be deleted everywhere — from every album and from All photos. To keep it
            elsewhere, use Remove instead. This can't be undone.
          </>
        }
        confirmLabel="Delete photo"
        busy={busy}
        error={actionError}
        onConfirm={confirmDeletePhoto}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={deleteAlbum}
        title={`Delete “${album.title}”?`}
        description={
          <div className="space-y-3">
            <p>The album will be removed. This can't be undone.</p>
            {onlyHere > 0 && (
              <label className="flex items-start gap-3 text-ink">
                <input
                  type="checkbox"
                  checked={alsoPhotos}
                  onChange={(e) => setAlsoPhotos(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-danger-700"
                />
                <span>
                  Also delete the {onlyHere} photo{onlyHere === 1 ? "" : "s"} that {onlyHere === 1 ? "isn't" : "aren't"} in any other album
                </span>
              </label>
            )}
          </div>
        }
        confirmLabel={alsoPhotos ? "Delete album and photos" : "Delete album"}
        busy={busy}
        error={actionError}
        onConfirm={confirmDeleteAlbum}
        onCancel={() => setDeleteAlbum(false)}
      />
    </>
  );
}

