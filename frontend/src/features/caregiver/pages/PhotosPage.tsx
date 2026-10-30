import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Images, Pencil, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import type { FamilyPhoto } from "@/api/types";
import { Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "../components";
import { AlbumTabs } from "../photos/AlbumTabs";
import { PhotoEditModal, PhotoUploader } from "../photos/PhotoFields";

const select = "block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] text-ink";

/** Every family photo, whichever albums it is in (or none). */
export function PhotosPage() {
  const photos = useAsync(() => api.photos(), []);
  const people = useAsync(() => api.people(), []);
  const memories = useAsync(() => api.memories(), []);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<FamilyPhoto | null>(null);
  const [toDelete, setToDelete] = useState<FamilyPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shown = useMemo(
    () => (photos.data ?? []).filter((p) => !filter || p.people.some((x) => x.id === filter)),
    [photos.data, filter],
  );

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
        title="Albums & photos"
        description="Photos are the heart of reminiscence. Add a title and a short story so they can be read aloud."
      />
      <AlbumTabs />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="library-heading" className="order-2 xl:order-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="library-heading" className="font-serif text-3xl text-ink">
              All photos {photos.data && <span className="font-sans text-base text-ink-muted">({shown.length})</span>}
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
            <Card className="rounded-3xl">
              <EmptyState
                icon={<Images className="h-6 w-6" aria-hidden="true" />}
                title={photos.data.length ? "No photos of this person yet" : "No photos yet"}
                description="Add a few family photos with a short story — they make gentle conversation starters."
              />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {shown.map((p) => (
                <li key={p.id}>
                  <Card className="flex h-full flex-col overflow-hidden rounded-3xl">
                    <div className="aspect-[4/3] bg-paper">
                      <img src={api.photoUrl(p.id, "thumb")} alt={p.caption || "Family photo"} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <h3 className="font-serif text-xl text-ink">{p.caption || "Untitled photo"}</h3>
                      {(p.taken_on || p.location) && <p className="text-sm text-ink-muted">{[p.taken_on, p.location].filter(Boolean).join(" · ")}</p>}
                      {p.story && <p className="line-clamp-3 text-[15px] text-ink">{p.story}</p>}
                      <p className="text-sm text-ink-muted">
                        {p.people.length ? `With ${p.people.map((x) => x.name).join(", ")}` : "No one tagged"}
                        {p.memory_id ? " · linked to a memory" : ""}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {p.albums?.length ? (
                          <>
                            In{" "}
                            {p.albums.map((a, i) => (
                              <span key={a.id}>
                                {i > 0 && ", "}
                                <Link to={`/caregiver/albums/${a.id}`} className="font-semibold text-primary-700 hover:underline">
                                  {a.title}
                                </Link>
                              </span>
                            ))}
                          </>
                        ) : (
                          "Not in an album"
                        )}
                      </p>
                      <div className="mt-auto flex gap-2 pt-3">
                        <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditing(p)}>
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
            <Card className="rounded-3xl">
              <CardHeader title="Add family photos" description="Shared with the patient in Memories and on each person's page." />
              <CardBody>
                <PhotoUploader
                  people={people.data ?? []}
                  memories={memories.data ?? []}
                  submitLabel="Add photos"
                  uploadOne={(file, d, onProgress, signal) => api.uploadPhotos([file], d, onProgress, signal)}
                  onUploaded={(added) => photos.setData((prev) => [...added, ...(prev ?? [])])}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <PhotoEditModal
        photo={editing}
        people={people.data ?? []}
        memories={memories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          photos.setData((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)));
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this photo?"
        description={
          <>
            “{toDelete?.caption || "Untitled photo"}” will be removed from every album
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
