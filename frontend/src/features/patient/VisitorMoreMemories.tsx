import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Images } from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";
import { LookTogether } from "./album/LookTogether";
import { photoAlt, photoItems } from "./album/pieces";
import type { Speech } from "./useSpeech";
import { useVisitorMemories } from "./useVisitorMemories";

/**
 * Below the recognised visitor: their family photos and a way into all of
 * their memories. Rendered only for a confirmed identity; the data always
 * belongs to `personId` (see useVisitorMemories). It is keyed by person, so
 * if the visitor changes the photo viewer closes with it, and its reading
 * aloud (ids starting "visitor-photo") is stopped by the patient screen.
 */
export function VisitorMoreMemories({ personId, name, voice }: { personId: string; name: string; voice?: Speech }) {
  const { data, loading, error } = useVisitorMemories(personId);
  const [viewing, setViewing] = useState<number | null>(null);
  const first = name.split(" ")[0];
  const photos = useMemo(() => (data ? data.photos.slice(0, 3) : []), [data]);
  const items = useMemo(() => photoItems(photos, "visitor-photo"), [photos]);

  if (loading) {
    return <div aria-hidden="true" data-testid="more-memories-loading" className="h-40 animate-pulse rounded-3xl bg-line/60" />;
  }
  // Quietly step aside on errors or when there's nothing more to show —
  // the last conversation above is already on screen.
  if (error || !data) return null;
  const extraMemories = Math.max(0, data.memories.length - 3);
  if (!photos.length && !extraMemories) return null;

  return (
    <section
      aria-labelledby="more-memories-heading"
      data-person={data.person.id}
      className="rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8"
    >
      <h4 id="more-memories-heading" className="flex items-center gap-2 font-serif text-2xl text-ink">
        <Images className="h-6 w-6 text-sage-700" aria-hidden="true" />
        Photos with {first}
      </h4>
      {photos.length > 0 && (
        <ul className={cn("mt-5 grid gap-4", photos.length === 1 ? "grid-cols-1 sm:w-1/2" : "grid-cols-2 sm:grid-cols-3")}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <figure>
                {voice ? (
                  <button
                    type="button"
                    onClick={() => setViewing(i)}
                    className="block w-full overflow-hidden rounded-2xl bg-paper ring-1 ring-line"
                    aria-label={`Look at ${p.caption || "this photo"}`}
                  >
                    <img src={api.photoUrl(p.id, "thumb")} alt={photoAlt(p)} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
                    <img src={api.photoUrl(p.id, "thumb")} alt={photoAlt(p)} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </div>
                )}
                {(p.caption || p.taken_on) && (
                  <figcaption className="mt-2 text-base leading-snug text-ink">
                    {p.caption}
                    {p.taken_on && <span className="block text-sm text-ink-muted">{p.taken_on}</span>}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      )}
      {extraMemories > 0 && (
        <p className="mt-5 text-lg text-ink-muted">
          {extraMemories} more {extraMemories === 1 ? "memory" : "memories"} with {first}.
        </p>
      )}
      <Link
        to={`/family/${personId}`}
        className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-5 text-lg font-semibold text-primary-700 hover:bg-primary-50"
      >
        See everything with {first}
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </Link>
      {voice && <LookTogether items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} speech={voice} />}
    </section>
  );
}
