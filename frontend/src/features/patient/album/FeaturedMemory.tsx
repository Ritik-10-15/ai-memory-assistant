import { useMemo, useState } from "react";
import { BookHeart, Shuffle } from "lucide-react";
import { api } from "@/api/client";
import { Button, ButtonLink } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import type { Speech } from "../useSpeech";
import { FramedPhoto, ListenButton, buildAlbum, itemPrompt, itemSpeech, itemText, itemTitle, itemWhen, photoAlt } from "./pieces";

/** Day of the year — the featured memory changes once a day, not on every visit. */
function dayIndex(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

/** "A memory to enjoy": one featured memory or family photo, with a gentle invitation. */
export function FeaturedMemory({ speech }: { speech: Speech }) {
  const album = useAsync(() => api.album(), []);
  // Photos make the best conversation starters, so feature those first.
  const items = useMemo(() => {
    if (!album.data) return [];
    const all = buildAlbum(album.data.memories, album.data.photos);
    return [...all.filter((i) => i.photo), ...all.filter((i) => !i.photo)];
  }, [album.data]);
  const [offset, setOffset] = useState(0);

  if (album.error || (album.data && !items.length)) {
    return (
      <section aria-labelledby="featured-heading" className="rounded-3xl border border-line bg-card p-6 shadow-card">
        <h2 id="featured-heading" className="text-2xl font-semibold text-ink">
          Your memory album
        </h2>
        <p className="mt-2 text-lg text-ink">
          {album.error ? "Memories aren't available right now." : "Family photos and memories will appear here once they're added."}
        </p>
      </section>
    );
  }
  if (!album.data) return <div className="h-72 animate-pulse rounded-3xl bg-line/60" aria-hidden="true" />;

  const item = items[(dayIndex() + offset) % items.length];
  const text = itemText(item);

  return (
    <section aria-labelledby="featured-heading" className="overflow-hidden rounded-3xl border border-clay-100 bg-card shadow-card">
      <div className="flex items-center gap-2 bg-clay-50 px-6 py-3 text-clay-700">
        <BookHeart className="h-5 w-5" aria-hidden="true" />
        <h2 id="featured-heading" className="font-sans text-base font-bold uppercase tracking-wide">
          A memory to enjoy
        </h2>
      </div>
      <div className="space-y-3 p-6">
        {item.photo && <FramedPhoto src={api.photoUrl(item.photo.id)} alt={photoAlt(item.photo)} className="shadow-none" />}
        <p className="text-base text-ink-muted">{itemWhen(item)}</p>
        <p className="font-serif text-2xl font-semibold leading-snug text-ink">{itemTitle(item)}</p>
        {text && <p className="line-clamp-4 text-lg leading-relaxed text-ink">{text}</p>}
        {text && <p className="font-serif text-lg italic text-ink-muted">{itemPrompt(item)}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          <ListenButton speech={speech} id={`featured:${item.key}`} text={itemSpeech(item)} />
          {items.length > 1 && (
            <Button
              size="lg"
              variant="secondary"
              icon={<Shuffle className="h-5 w-5" aria-hidden="true" />}
              onClick={() => {
                speech.stop();
                setOffset((o) => o + 1);
              }}
            >
              Show another
            </Button>
          )}
        </div>
      </div>
      <div className="border-t border-line p-4">
        <ButtonLink to="/memories" variant="accent" size="xl" className="w-full" icon={<BookHeart className="h-6 w-6" aria-hidden="true" />}>
          Explore memories
        </ButtonLink>
      </div>
    </section>
  );
}
