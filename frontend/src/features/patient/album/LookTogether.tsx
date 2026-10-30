import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight, MessageCircleHeart, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { Speech } from "../useSpeech";
import {
  FramedPhoto,
  ListenButton,
  guidedPrompt,
  itemHighlight,
  itemPeople,
  itemSpeech,
  itemText,
  itemTitle,
  itemWhenWhere,
  photoAlt,
  type AlbumItem,
} from "./pieces";

/** The optional invitation under a memory: its button does what it offers. */
export function GuidedPromptCard({
  item,
  speech,
  onNext,
}: {
  item: AlbumItem;
  speech: Speech;
  onNext?: () => void;
}) {
  const prompt = guidedPrompt(item);
  const canListen = prompt.action === "listen" && speech.supported;
  const canNext = prompt.action === "next" && onNext;
  return (
    <div className="rounded-3xl border border-sage-200 bg-sage-50 p-5">
      <p className="flex gap-3 font-serif text-2xl leading-snug text-ink">
        <MessageCircleHeart className="mt-1 h-6 w-6 shrink-0 text-sage-700" aria-hidden="true" />
        {prompt.text}
      </p>
      {(canListen || canNext) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {canListen && <ListenButton speech={speech} id={item.key} text={itemSpeech(item)} size="xl" />}
          {canNext && (
            <Button size="xl" variant="secondary" onClick={onNext}>
              Show me another
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The photo viewer ("Look together"): one memory or photo at a time,
 * full-size, with big Previous / Next controls — made for a carer and their
 * loved one sharing a tablet. Arrow keys move between items; Escape closes.
 * Nothing moves or plays by itself, and moving on stops any reading aloud.
 */
export function LookTogether({
  items,
  index,
  onIndex,
  onClose,
  speech,
}: {
  items: AlbumItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  speech: Speech;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = index !== null && items.length > 0;
  const item = open ? items[Math.min(index, items.length - 1)] : null;
  const { stop } = speech;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  // Moving to another item, or closing, stops reading the previous one.
  useEffect(() => stop(), [index, stop]);
  useEffect(() => () => stop(), [stop]);

  const go = (delta: number) => {
    if (index === null) return;
    onIndex((index + delta + items.length) % items.length);
  };

  const people = item?.photo?.people ?? [];
  const highlight = item ? itemHighlight(item) : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="h-[min(96vh,62rem)] w-[min(98vw,76rem)] rounded-3xl border border-line bg-paper p-0 text-ink shadow-raised backdrop:bg-ink/70"
    >
      {item && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 sm:px-6">
            <p className="text-lg text-ink-muted" aria-live="polite">
              {index! + 1} of {items.length}
            </p>
            <Button variant="secondary" size="lg" icon={<X className="h-5 w-5" aria-hidden="true" />} onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="grid flex-1 gap-6 overflow-y-auto p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
            {item.photo ? (
              <FramedPhoto
                src={api.photoUrl(item.photo.id)}
                alt={photoAlt(item.photo)}
                aspect="aspect-[4/3]"
                fit="contain"
                className="lg:sticky lg:top-0"
              />
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}
            <div className="space-y-5">
              <p className="text-lg text-ink-muted">{itemWhenWhere(item)}</p>
              <h2 id={titleId} className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
                {itemTitle(item)}
              </h2>
              {people.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="In this photo">
                  {people.map((p) => (
                    <li key={p.id} className="rounded-full bg-card px-4 py-1.5 text-lg ring-1 ring-line">
                      <span className="font-semibold text-ink">{p.name}</span>
                      {p.relationship && <span className="text-ink-muted"> · {p.relationship}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                item.kind === "memory" && <p className="text-xl text-ink-muted">With {itemPeople(item).join(", ")}</p>
              )}
              {itemText(item) && <p className="whitespace-pre-line text-2xl leading-relaxed text-ink">{itemText(item)}</p>}
              {highlight && (
                <figure className="rounded-3xl border-l-4 border-primary-600 bg-card px-5 py-4">
                  <figcaption className="text-base font-semibold text-ink-muted">
                    From a conversation with {highlight.person_name}
                    {highlight.created_at ? `, ${formatDate(highlight.created_at)}` : ""}
                  </figcaption>
                  <blockquote className="mt-1 font-serif text-xl italic leading-relaxed text-ink">{highlight.summary}</blockquote>
                </figure>
              )}
              <GuidedPromptCard item={item} speech={speech} onNext={items.length > 1 ? () => go(1) : undefined} />
            </div>
          </div>

          {items.length > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
              <Button size="xl" variant="secondary" icon={<ChevronLeft className="h-7 w-7" aria-hidden="true" />} onClick={() => go(-1)}>
                Previous
              </Button>
              <Button size="xl" onClick={() => go(1)}>
                Next
                <ChevronRight className="h-7 w-7" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
