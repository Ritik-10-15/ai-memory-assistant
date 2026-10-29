import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui";
import type { Speech } from "../useSpeech";
import {
  FramedPhoto,
  ListenButton,
  itemPeople,
  itemSpeech,
  itemText,
  itemTitle,
  itemWhen,
  peopleSentence,
  photoAlt,
  type AlbumItem,
} from "./pieces";

/**
 * "Look together": one memory or photo at a time, full-size, with big
 * Previous / Next controls — made for a carer and their loved one sharing
 * a tablet. Arrow keys move between items; Escape closes.
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
  const item = open ? items[index] : null;
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

  // Moving to another item stops reading the previous one.
  useEffect(() => stop(), [index, stop]);

  const go = (delta: number) => {
    if (index === null) return;
    onIndex((index + delta + items.length) % items.length);
  };

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
      className="h-[min(94vh,60rem)] w-[min(96vw,64rem)] rounded-3xl border border-line bg-paper p-0 text-ink shadow-raised backdrop:bg-ink/60"
    >
      {item && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
            <p className="text-lg text-ink-muted" aria-live="polite">
              {index! + 1} of {items.length}
            </p>
            <Button variant="secondary" icon={<X className="h-5 w-5" aria-hidden="true" />} onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
            {item.photo ? (
              <FramedPhoto src={api.photoUrl(item.photo.id)} alt={photoAlt(item.photo)} aspect="aspect-[4/3]" />
            ) : (
              <div className="hidden md:block" aria-hidden="true" />
            )}
            <div className="space-y-4">
              <p className="text-lg text-ink-muted">{itemWhen(item)}</p>
              <h2 id={titleId} className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                {itemTitle(item)}
              </h2>
              {itemText(item) && <p className="whitespace-pre-line text-2xl leading-relaxed text-ink">{itemText(item)}</p>}
              {itemPeople(item).length > 0 && (
                <p className="text-xl text-ink-muted">With {peopleSentence(itemPeople(item))}</p>
              )}
              <ListenButton speech={speech} id={item.key} text={itemSpeech(item)} size="xl" />
            </div>
          </div>

          {items.length > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
              <Button size="xl" variant="secondary" icon={<ChevronLeft className="h-7 w-7" aria-hidden="true" />} onClick={() => go(-1)}>
                Previous
              </Button>
              <p className="hidden font-serif text-xl italic text-ink-muted sm:block">Shall we look at another?</p>
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
