import { Link } from "react-router-dom";
import { BookImage, RefreshCw } from "lucide-react";
import type { AlbumSummary } from "@/api/types";
import { api } from "@/api/client";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { usePageTitle } from "../usePageTitle";
import { PatientEmptyState } from "./PatientEmptyState";
import { FramedPhoto, tileImage } from "./pieces";

function photoCount(n: number) {
  return n === 0 ? "No photos yet" : `${n} photo${n === 1 ? "" : "s"}`;
}

/** An album on the shelf: a large cover and its name — the whole card opens it. */
export function AlbumShelfCard({ album }: { album: AlbumSummary }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card transition-shadow hover:shadow-raised"
    >
      <div className="p-3 pb-0">
        {album.cover_photo_id ? (
          <FramedPhoto {...tileImage(album.cover_photo_id)} alt="" className="shadow-none ring-0" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-sage-50 text-sage-700">
            <BookImage className="h-14 w-14" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-6">
        <h2 className="font-serif text-3xl leading-tight text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
          {album.title}
        </h2>
        {album.description && <p className="line-clamp-3 text-xl leading-relaxed text-ink">{album.description}</p>}
        <p className="mt-auto pt-2 text-lg text-ink-muted">{photoCount(album.photo_count)}</p>
      </div>
    </Link>
  );
}

/** The patient's photo albums: big covers, nothing to get wrong. */
export function AlbumShelfPage() {
  usePageTitle("Photo albums");
  const albums = useAsync(() => api.albums(), []);

  return (
    <div>
      <h1 className="text-4xl font-semibold text-ink sm:text-5xl">Photo albums</h1>
      <p className="mt-2 text-xl text-ink-muted">Family photos and the stories behind them. Take your time.</p>
      <div className="mt-8">
        {albums.error ? (
          <PatientEmptyState
            title="I couldn't open the albums just now"
            action={
              <Button size="xl" variant="secondary" icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />} onClick={albums.reload}>
                Try again
              </Button>
            }
          />
        ) : !albums.data ? (
          <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl bg-line/60" />
            ))}
          </div>
        ) : !albums.data.length ? (
          <PatientEmptyState
            icon={<BookImage className="h-10 w-10" aria-hidden="true" />}
            title="No albums yet"
            text="Family photo albums will appear here once they're put together."
          />
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {albums.data.map((a) => (
              <li key={a.id}>
                <AlbumShelfCard album={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
