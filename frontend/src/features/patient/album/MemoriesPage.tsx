import { useMemo, useState } from "react";
import { BookHeart, Images, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { cn } from "@/lib/cn";
import { usePageTitle } from "../usePageTitle";
import type { Speech } from "../useSpeech";
import { LookTogether } from "./LookTogether";
import { PatientEmptyState } from "./PatientEmptyState";
import { AlbumCard, buildAlbum, itemPeople } from "./pieces";

/** The memory album: conversation memories and family photos to enjoy. */
export function MemoriesPage({ speech }: { speech: Speech }) {
  usePageTitle("Memories");
  const album = useAsync(() => api.album(), []);
  const [who, setWho] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const all = useMemo(() => (album.data ? buildAlbum(album.data.memories, album.data.photos) : []), [album.data]);
  const people = useMemo(() => [...new Set(all.flatMap(itemPeople))].sort(), [all]);
  const items = useMemo(() => (who ? all.filter((i) => itemPeople(i).includes(who)) : all), [all, who]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-ink sm:text-5xl">Memories</h1>
          <p className="mt-2 text-xl text-ink-muted">There are no right or wrong answers — just enjoy looking.</p>
        </div>
        {items.length > 0 && (
          <Button size="xl" icon={<Images className="h-6 w-6" aria-hidden="true" />} onClick={() => setViewing(0)}>
            Look together
          </Button>
        )}
      </div>

      {people.length > 1 && (
        <div role="group" aria-label="Show memories with" className="mt-6 flex flex-wrap gap-3">
          {[null, ...people].map((name) => {
            const active = who === name;
            return (
              <button
                key={name ?? "everyone"}
                type="button"
                aria-pressed={active}
                onClick={() => setWho(name)}
                className={cn(
                  "min-h-12 rounded-full border px-5 text-lg font-semibold transition-colors",
                  active ? "border-primary-700 bg-primary-700 text-white" : "border-line-strong bg-card text-ink hover:bg-primary-50",
                )}
              >
                {name ?? "Everyone"}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <h2 className="sr-only">{who ? `Memories with ${who}` : "All memories"}</h2>
        {album.error ? (
          <PatientEmptyState
            title="I couldn't open the memories just now"
            action={
              <Button size="xl" variant="secondary" icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />} onClick={album.reload}>
                Try again
              </Button>
            }
          />
        ) : !album.data ? (
          <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl bg-line/60" />
            ))}
          </div>
        ) : !all.length ? (
          <PatientEmptyState
            icon={<BookHeart className="h-10 w-10" aria-hidden="true" />}
            title="Your memory album is waiting"
            text="Memories from visits and family photos will appear here once they're added."
          />
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, i) => (
              <li key={item.key}>
                <AlbumCard item={item} speech={speech} onOpen={() => setViewing(i)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <LookTogether items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} speech={speech} />
    </div>
  );
}
