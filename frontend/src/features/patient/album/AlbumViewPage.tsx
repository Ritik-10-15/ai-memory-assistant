import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, BookImage, Images, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/api/client";
import type { AlbumSummary, FamilyPhoto } from "@/api/types";
import { Button, ButtonLink } from "@/components/ui";
import { usePageTitle } from "../usePageTitle";
import type { Speech } from "../useSpeech";
import { LookTogether } from "./LookTogether";
import { PatientEmptyState } from "./PatientEmptyState";
import { FramedPhoto, itemTitle, itemWhenWhere, peopleSentence, photoAlt, photoItems, tileImage, type AlbumItem } from "./pieces";

const PAGE = 30;

type Load =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; album: AlbumSummary; photos: FamilyPhoto[]; total: number };

/** A memory story card: the photo, its title, when/where, and who is in it. */
function MemoryStoryCard({ item, onOpen }: { item: AlbumItem; onOpen: () => void }) {
  const photo = item.photo!;
  const people = photo.people.map((p) => p.name);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <button type="button" onClick={onOpen} className="block p-3 pb-0 text-left" aria-label={`Look at ${itemTitle(item)}`}>
        <FramedPhoto {...tileImage(photo.id)} alt={photoAlt(photo)} className="shadow-none ring-0" />
      </button>
      <div className="flex flex-1 flex-col gap-2 p-6">
        <p className="text-base text-ink-muted">{itemWhenWhere(item)}</p>
        <h3 className="font-serif text-2xl leading-snug text-ink">{itemTitle(item)}</h3>
        {photo.story && <p className="line-clamp-4 text-xl leading-relaxed text-ink">{photo.story}</p>}
        {people.length > 0 && <p className="text-lg text-ink-muted">With {peopleSentence(people)}</p>}
        <div className="mt-auto pt-3">
          <Button size="lg" variant="secondary" onClick={onOpen}>
            {photo.story || photo.memory ? "Look closer" : "Look at this photo"}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** One album: a large cover, story cards, and the photo viewer. */
export function AlbumViewPage({ speech }: { speech: Speech }) {
  const { id = "" } = useParams();
  const [state, setState] = useState<Load>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const current = useRef(id);
  usePageTitle(state.status === "ready" ? state.album.title : "Photo album");

  useEffect(() => {
    current.current = id;
    setState({ status: "loading" });
    setViewing(null);
    api
      .albumPage(id, 0, PAGE)
      .then((page) => {
        if (current.current !== id) return;
        setState({ status: "ready", album: page.album, photos: page.photos, total: page.total });
      })
      .catch((err) => {
        if (current.current !== id) return;
        setState({ status: err instanceof ApiError && err.status === 404 ? "missing" : "error" });
      });
  }, [id, nonce]);

  async function loadMore() {
    if (state.status !== "ready") return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await api.albumPage(id, state.photos.length, PAGE);
      if (current.current !== id) return;
      setState((s) => (s.status === "ready" ? { ...s, photos: [...s.photos, ...page.photos], total: page.total } : s));
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const items = useMemo(() => (state.status === "ready" ? photoItems(state.photos, `album-${id}`) : []), [state, id]);

  const back = (
    <ButtonLink to="/albums" variant="ghost" size="lg" className="-ml-3 mb-4" icon={<ArrowLeft className="h-5 w-5" aria-hidden="true" />}>
      All albums
    </ButtonLink>
  );

  if (state.status === "loading") {
    return (
      <div aria-busy="true">
        {back}
        <div className="h-80 animate-pulse rounded-3xl bg-line/60" />
      </div>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <div>
        {back}
        <PatientEmptyState
          icon={<BookImage className="h-10 w-10" aria-hidden="true" />}
          title={state.status === "missing" ? "This album isn't available" : "I couldn't open this album just now"}
          action={
            state.status === "error" ? (
              <Button size="xl" variant="secondary" icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />} onClick={() => setNonce((n) => n + 1)}>
                Try again
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { album, photos, total } = state;
  return (
    <div>
      {back}
      <section className="grid gap-6 rounded-3xl border border-line bg-card p-5 shadow-card sm:p-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center">
        {album.cover_photo_id ? (
          <FramedPhoto {...tileImage(album.cover_photo_id, "(min-width: 768px) 50vw, 100vw")} alt="" className="shadow-none" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-sage-50 text-sage-700">
            <BookImage className="h-16 w-16" aria-hidden="true" />
          </div>
        )}
        <div>
          <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">{album.title}</h1>
          {album.description && <p className="mt-4 whitespace-pre-line text-2xl leading-relaxed text-ink">{album.description}</p>}
          <p className="mt-4 text-xl text-ink-muted">{total === 0 ? "No photos yet" : `${total} photo${total === 1 ? "" : "s"}`}</p>
          {items.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="font-serif text-xl italic text-ink-muted">Would you like to look through these photos together?</p>
              <Button size="xl" icon={<Images className="h-6 w-6" aria-hidden="true" />} onClick={() => setViewing(0)}>
                Look through the album
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="mt-8">
        <h2 className="sr-only">Photos in {album.title}</h2>
        {!items.length ? (
          <PatientEmptyState icon={<BookImage className="h-10 w-10" aria-hidden="true" />} title="This album is empty for now" text="Photos will appear here once they're added." />
        ) : (
          <>
            <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item, i) => (
                <li key={item.key}>
                  <MemoryStoryCard item={item} onOpen={() => setViewing(i)} />
                </li>
              ))}
            </ul>
            {photos.length < total && (
              <div className="mt-8 flex flex-col items-center gap-3">
                <Button size="xl" variant="secondary" loading={loadingMore} onClick={loadMore}>
                  Show more photos
                </Button>
                {moreError && <p className="text-lg text-ink">I couldn't load more just now. Please try again.</p>}
              </div>
            )}
          </>
        )}
      </div>

      <LookTogether items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} speech={speech} />
    </div>
  );
}
