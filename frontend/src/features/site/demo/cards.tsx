import { useEffect } from "react";
import { CircleHelp, Clock3, Hourglass, Lock, ScanFace, Search, Square, UserRound, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/features/patient/useSpeech";
import { MemoryScene, Portrait } from "../Illustration";
import type { DemoPerson, DemoView, RecognitionStatus as Status } from "./model";

// ── RecognitionStatus ────────────────────────────────────────────────
const STATUS: Record<Status, { text: string; cls: string; Icon: typeof ScanFace }> = {
  idle: { text: "Waiting", cls: "bg-mint-100 text-deep", Icon: Clock3 },
  detecting: { text: "Face detected · identifying", cls: "bg-white text-deep ring-1 ring-forest/20", Icon: Search },
  known: { text: "Recognised", cls: "bg-forest text-white", Icon: ScanFace },
  holding: { text: "Holding briefly", cls: "bg-forest/10 text-forest", Icon: Hourglass },
  uncertain: { text: "Not sure yet", cls: "bg-[#FFF1D6] text-[#7A5300]", Icon: CircleHelp },
  unknown: { text: "Unknown visitor", cls: "bg-mint-100 text-deep", Icon: UserRound },
};

export function RecognitionStatus({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span data-testid="recognition-status" className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", s.cls)}>
      <s.Icon className="h-4 w-4" aria-hidden="true" />
      {s.text}
    </span>
  );
}

export function statusText(status: Status) {
  return STATUS[status].text;
}

// ── VisitorProfileCard ───────────────────────────────────────────────
/** Who is here — built only from the derived view, never from a previous frame. */
export function VisitorProfileCard({ view }: { view: DemoView }) {
  const p = view.person;
  if (p) {
    const first = p.name.split(" ")[0];
    return (
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] shadow-soft ring-4 ring-white sm:h-32 sm:w-32 sm:rounded-[1.5rem]">
          <Portrait figure={p.id} title={`Portrait illustration of ${first}`} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[1.6rem] leading-tight text-deep sm:text-[1.9rem]">This is {p.name}</p>
          <p className="mt-1 text-lg font-medium text-forest">{p.relationship}</p>
          <p className="mt-1 text-[15px] text-moss">Last visited {p.lastVisit}</p>
        </div>
      </div>
    );
  }
  const copy: Record<Exclude<Status, "known" | "holding">, { title: string; text: string }> = {
    idle: { title: "Waiting for a visitor", text: "When someone sits in front of the camera, the screen will say who it is." },
    detecting: { title: "Someone is here", text: "Just a moment while they're recognised." },
    uncertain: {
      title: view.candidateFirstName ? `This might be ${view.candidateFirstName}` : "Not sure who this is",
      text: "It's okay to ask their name. Nothing personal is shown until the match is confirmed.",
    },
    unknown: { title: "Unknown visitor", text: "I don't recognise this person. It's perfectly fine to ask who they are." },
  };
  const c = copy[view.status as keyof typeof copy];
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.25rem] bg-mint-100 text-forest sm:h-32 sm:w-32 sm:rounded-[1.5rem]">
        {view.status === "uncertain" ? (
          <CircleHelp className="h-12 w-12" aria-hidden="true" />
        ) : view.status === "idle" ? (
          <Clock3 className="h-12 w-12" aria-hidden="true" />
        ) : (
          <UserRound className="h-12 w-12" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display text-[1.6rem] leading-tight text-deep sm:text-[1.9rem]">{c.title}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-moss">{c.text}</p>
      </div>
    </div>
  );
}

// ── MemoryRecallCard ─────────────────────────────────────────────────
/**
 * The last conversation and a family memory for a CONFIRMED person.
 * Mounted only while that person is shown — switching visitor unmounts it
 * (and its speech) entirely rather than hiding it.
 */
export function MemoryRecallCard({ person, frameKey }: { person: DemoPerson; frameKey: string }) {
  const speech = useSpeech();
  const { stop } = speech;
  // Any change of step stops reading — audio never carries across frames.
  useEffect(() => stop(), [frameKey, stop]);

  const first = person.name.split(" ")[0];
  const text = `Last time you spoke with ${first}: ${person.conversation} A memory together: ${person.memory.title}. ${person.memory.story}`;

  return (
    <div data-testid="memory-card" className="space-y-4">
      <div className="rounded-2xl bg-mint/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-moss">Last time you spoke</p>
        <p className="mt-1.5 text-[16px] leading-relaxed text-deep">{person.conversation}</p>
      </div>
      {speech.supported ? (
        <div className="flex flex-wrap items-center gap-3">
          {speech.speaking ? (
            <button
              type="button"
              onClick={speech.stop}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-deep px-5 font-semibold text-white hover:bg-forest-800"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => speech.speak(text, "demo")}
              aria-label={`Listen to the memory with ${first}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-forest/30 bg-white px-5 font-semibold text-forest hover:border-forest"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              Listen
            </button>
          )}
          <span className="text-sm text-moss">{speech.speaking ? "Reading aloud…" : "Audio available · plays only when you choose"}</span>
        </div>
      ) : (
        <p className="text-sm text-moss">Reading aloud isn't supported in this browser.</p>
      )}
    </div>
  );
}

/** A family memory for a CONFIRMED person; mounted only while they are shown. */
export function FamilyMemoryCard({ person }: { person: DemoPerson }) {
  return (
    <article data-testid="family-memory" className="overflow-hidden rounded-2xl border border-forest/10 bg-white">
      <div className="aspect-[16/9]">
        <MemoryScene scene={person.memory.scene} companion={person.id} title={`Illustration of a family memory: ${person.memory.title}`} />
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-plum-700">Family memory · {person.memory.when}</p>
        <h3 className="mt-1 font-display text-xl text-deep">{person.memory.title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-moss">{person.memory.story}</p>
      </div>
    </article>
  );
}

/** What sits in the memory slot when there is no confirmed person to recall. */
export function MemoryPlaceholder({ view, recall }: { view: DemoView; recall: boolean }) {
  let icon = <Search className="h-5 w-5" aria-hidden="true" />;
  let text: string | null = null;
  if (view.person && !recall) text = "Looking up memories…";
  else if (view.status === "uncertain" && recall) {
    icon = <Lock className="h-5 w-5" aria-hidden="true" />;
    text = "Memories stay private until the match is confirmed.";
  } else if (view.status === "unknown" && recall) {
    icon = <Lock className="h-5 w-5" aria-hidden="true" />;
    text = "No memories to show — this visitor isn't enrolled.";
  }
  if (!text) return null;
  return (
    <p data-testid="memory-placeholder" className="flex items-center gap-3 rounded-2xl border border-dashed border-forest/25 p-4 text-[15px] text-moss">
      {icon}
      {text}
    </p>
  );
}
