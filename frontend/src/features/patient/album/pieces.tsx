import { useState, type ReactNode } from "react";
import { ImageOff, Square, Volume2 } from "lucide-react";
import { api } from "@/api/client";
import type { AlbumMemory, FamilyPhoto } from "@/api/types";
import { Avatar, Button } from "@/components/ui";
import { toneFor } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { formatDate, initials, parseServerTime } from "@/lib/format";
import type { Speech } from "../useSpeech";

/** A printed-photo frame around an image, with a calm fallback if it can't load. */
export function FramedPhoto({
  src,
  alt,
  aspect = "aspect-[4/3]",
  className,
  fallback,
}: {
  src: string | null;
  alt: string;
  aspect?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("photo-frame", className)}>
      <div className={cn("relative overflow-hidden rounded-xl bg-paper", aspect)}>
        {src && !failed ? (
          <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          (fallback ?? (
            <div className="flex h-full w-full items-center justify-center text-ink-muted" role="img" aria-label={alt}>
              <ImageOff className="h-10 w-10" aria-hidden="true" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** A person's picture as a large album tile, with a warm monogram if there is none. */
export function PersonPhoto({ id, name, aspect = "aspect-[4/5]", className }: { id: string; name: string; aspect?: string; className?: string }) {
  return (
    <FramedPhoto
      src={api.personPhotoUrl(id)}
      alt={`Photo of ${name}`}
      aspect={aspect}
      className={className}
      fallback={
        <div
          role="img"
          aria-label={name}
          className={cn("flex h-full w-full items-center justify-center font-serif text-6xl font-semibold", toneFor(name))}
        >
          <span aria-hidden="true">{initials(name)}</span>
        </div>
      }
    />
  );
}

/** Large Listen / Stop control for one item. Only one item speaks at a time. */
export function ListenButton({
  speech,
  id,
  text,
  label = "Listen",
  size = "lg",
}: {
  speech: Speech;
  id: string;
  text: string;
  label?: string;
  size?: "lg" | "xl";
}) {
  if (!speech.supported || !text) return null;
  const active = speech.speakingId === id;
  return active ? (
    <Button size={size} variant="danger" icon={<Square className="h-5 w-5" aria-hidden="true" />} onClick={speech.stop}>
      Stop
    </Button>
  ) : (
    <Button size={size} icon={<Volume2 className="h-6 w-6" aria-hidden="true" />} onClick={() => speech.speak(text, id)}>
      {label}
    </Button>
  );
}

/** One thing to look at in the album: a memory (maybe with a photo) or a family photo. */
export type AlbumItem =
  | { kind: "memory"; key: string; date: string; memory: AlbumMemory; photo: FamilyPhoto | null }
  | { kind: "photo"; key: string; date: string; photo: FamilyPhoto };

/** Memories (with their linked photo) plus photos not attached to a memory, newest first. */
export function buildAlbum(memories: AlbumMemory[], photos: FamilyPhoto[]): AlbumItem[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const linked = new Set(memories.map((m) => m.photo_id).filter(Boolean));
  const items: AlbumItem[] = [
    ...memories.map((m) => ({
      kind: "memory" as const,
      key: `memory:${m.id}`,
      date: m.created_at,
      memory: m,
      photo: m.photo_id ? (byId.get(m.photo_id) ?? null) : null,
    })),
    ...photos
      .filter((p) => !linked.has(p.id))
      .map((p) => ({ kind: "photo" as const, key: `photo:${p.id}`, date: p.created_at, photo: p })),
  ];
  const t = (i: AlbumItem) => parseServerTime(i.date)?.getTime() ?? 0;
  return items.sort((a, b) => t(b) - t(a));
}

export function itemPeople(item: AlbumItem): string[] {
  if (item.kind === "memory") return [item.memory.person_name];
  return item.photo.people.map((p) => p.name);
}

export function itemTitle(item: AlbumItem): string {
  if (item.kind === "photo") return item.photo.caption || peopleSentence(itemPeople(item)) || "A family photo";
  return item.photo?.caption || `With ${item.memory.person_name}`;
}

export function itemText(item: AlbumItem): string {
  return item.kind === "memory" ? item.memory.summary : item.photo.story;
}

/** When it happened, in words: the photo's own date if given, else when it was saved. */
export function itemWhen(item: AlbumItem): string {
  const taken = item.photo?.taken_on;
  if (taken) return taken;
  return formatDate(item.date);
}

/** Gentle, pressure-free invitation — never a question with a right answer. */
export function itemPrompt(item: AlbumItem): string {
  if (item.kind === "memory") return item.photo ? "Would you like to hear about this day?" : "Would you like to listen to this memory?";
  return item.photo.story ? "Shall we look at this photo together?" : "A photo to enjoy.";
}

/** What reading aloud says for an item. */
export function itemSpeech(item: AlbumItem): string {
  const parts = [itemTitle(item) + "."];
  const text = itemText(item);
  if (text) parts.push(text);
  return parts.join(" ");
}

export function peopleSentence(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function photoAlt(photo: FamilyPhoto): string {
  const who = peopleSentence(photo.people.map((p) => p.name));
  if (photo.caption && who) return `${photo.caption}, with ${who}`;
  return photo.caption || (who ? `Photo of ${who}` : "Family photo");
}

/** Album card used on the Memories page and a person's page. */
export function AlbumCard({ item, speech, onOpen }: { item: AlbumItem; speech: Speech; onOpen?: () => void }) {
  const photo = item.photo;
  const people = itemPeople(item);
  const text = itemText(item);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      {photo && (
        <button
          type="button"
          onClick={onOpen}
          className="block p-3 pb-0 text-left"
          aria-label={`Look at this photo: ${itemTitle(item)}`}
          disabled={!onOpen}
        >
          <FramedPhoto src={api.photoUrl(photo.id)} alt={photoAlt(photo)} className="shadow-none ring-0" />
        </button>
      )}
      {!photo && item.kind === "memory" && (
        <div className="flex items-center gap-4 bg-clay-50 px-6 py-5">
          <Avatar name={item.memory.person_name} src={api.personPhotoUrl(item.memory.person_id)} size="lg" />
          <p className="font-serif text-lg italic text-clay-700">A conversation with {item.memory.person_name}</p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <p className="text-base text-ink-muted">{itemWhen(item)}</p>
        <h3 className="font-serif text-2xl font-semibold leading-snug text-ink">{itemTitle(item)}</h3>
        {text && <p className="whitespace-pre-line text-xl leading-relaxed text-ink">{text}</p>}
        {people.length > 0 && item.kind === "photo" && (
          <p className="text-lg text-ink-muted">With {peopleSentence(people)}</p>
        )}
        <div className="mt-auto space-y-3 pt-2">
          {text && <p className="font-serif text-lg italic text-ink-muted">{itemPrompt(item)}</p>}
          <div className="flex flex-wrap gap-3">
            <ListenButton speech={speech} id={item.key} text={itemSpeech(item)} />
            {onOpen && !photo && (
              <Button size="lg" variant="secondary" onClick={onOpen}>
                Look closer
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
