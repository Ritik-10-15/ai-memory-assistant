import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookImage, EyeOff, FolderPlus } from "lucide-react";
import { api } from "@/api/client";
import type { CaregiverAlbum } from "@/api/types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, TextAreaField, TextField } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatShortDate } from "@/lib/format";
import { PageHeader } from "../components";
import { AlbumTabs } from "../photos/AlbumTabs";

/** Shown-to-patient checkbox, used when creating and editing an album. */
export function VisibleToPatientField({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-5 w-5 shrink-0 rounded border-line-strong accent-sage-700"
      />
      <div>
        <label htmlFor={id} className="text-[15px] font-semibold text-ink">
          Show this album on the patient screen
        </label>
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          Untick while you're still putting it together. Photos that are only in hidden albums aren't shown to the patient anywhere.
        </p>
      </div>
    </div>
  );
}

function CreateAlbumCard() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please give the album a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { album } = await api.createAlbum({ title: title.trim(), description: description.trim(), visible_to_patient: visible });
      navigate(`/caregiver/albums/${album.id}`, { state: { created: true } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader title="New album" description="Group photos around a person, a place or a time — e.g. “Whitby summers”." />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <TextField
            label="Album name"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            maxLength={120}
            error={error ?? undefined}
            required
          />
          <TextAreaField
            label="Description (optional)"
            hint="Shown at the top of the album."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
          />
          <VisibleToPatientField id="new-album-visible" checked={visible} onChange={setVisible} />
          <Button type="submit" loading={busy} icon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}>
            Create album
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function AlbumCover({ album, className }: { album: Pick<CaregiverAlbum, "cover_photo_id" | "title">; className?: string }) {
  return album.cover_photo_id ? (
    <img src={api.photoUrl(album.cover_photo_id, "thumb")} alt="" loading="lazy" className={className} />
  ) : (
    <div className={`flex items-center justify-center bg-sage-50 text-sage-700 ${className ?? ""}`}>
      <BookImage className="h-10 w-10" aria-hidden="true" />
    </div>
  );
}

function AlbumTile({ album }: { album: CaregiverAlbum }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <div className="p-3 pb-0">
        <AlbumCover album={album} className="aspect-[4/3] w-full rounded-2xl object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h2 className="font-serif text-2xl leading-tight text-ink">
          <Link to={`/caregiver/albums/${album.id}`} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {album.title}
          </Link>
        </h2>
        {album.description && <p className="line-clamp-2 text-[15px] text-ink-muted">{album.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-sm text-ink-muted">
          <span>
            {album.photo_count} photo{album.photo_count === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span>Updated {formatShortDate(album.updated_at)}</span>
          {!album.visible_to_patient && (
            <Badge tone="warning">
              <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Hidden from patient
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}

export function AlbumsPage() {
  const albums = useAsync(() => api.careAlbums(), []);

  return (
    <>
      <PageHeader
        title="Albums & photos"
        description="Curate family photos into albums the patient can look through, with the stories behind them."
      />
      <AlbumTabs />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="albums-heading" className="order-2 xl:order-1">
          <h2 id="albums-heading" className="sr-only">
            Albums
          </h2>
          {albums.error ? (
            <ErrorState message={albums.error.message} onRetry={albums.reload} />
          ) : !albums.data ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-80 rounded-3xl" />
              ))}
            </div>
          ) : !albums.data.length ? (
            <Card className="rounded-3xl">
              <EmptyState
                icon={<BookImage className="h-6 w-6" aria-hidden="true" />}
                title="No albums yet"
                description="Create the first album, then add photos and the stories behind them."
              />
            </Card>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-muted">
                {albums.data.length} album{albums.data.length === 1 ? "" : "s"}
              </p>
              <ul className="grid gap-5 sm:grid-cols-2">
                {albums.data.map((a) => (
                  <li key={a.id}>
                    <AlbumTile album={a} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <div className="order-1 xl:order-2">
          <CreateAlbumCard />
          {albums.data && !albums.data.length && (
            <Alert tone="info" className="mt-4">
              Photos you've already added are kept in “All photos”. You can add them to an album from the album's page.
            </Alert>
          )}
        </div>
      </div>
    </>
  );
}
