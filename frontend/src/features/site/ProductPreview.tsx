import { CircleHelp, HeartHandshake, ScanFace, Square, UserRound, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/features/patient/useSpeech";
import { DEMO_VISITOR, type DemoScenario } from "./demoData";
import { CameraScene, MemoryScene } from "./Illustration";

const first = DEMO_VISITOR.name.split(" ")[0];

function StatusChip({ scenario }: { scenario: DemoScenario }) {
  const chip = {
    known: { text: "Recognised", cls: "bg-forest text-white", Icon: ScanFace },
    uncertain: { text: "Not sure yet", cls: "bg-[#FFF1D6] text-[#7A5300]", Icon: CircleHelp },
    unknown: { text: "Not recognised", cls: "bg-mint-100 text-deep", Icon: UserRound },
    empty: { text: "Waiting", cls: "bg-mint-100 text-deep", Icon: ScanFace },
  }[scenario];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", chip.cls)}>
      <chip.Icon className="h-4 w-4" aria-hidden="true" />
      {chip.text}
    </span>
  );
}

function ListenButton() {
  const speech = useSpeech();
  if (!speech.supported) return null;
  const text = `This is ${DEMO_VISITOR.name}, ${DEMO_VISITOR.relationship.toLowerCase()}. Last time you spoke: ${DEMO_VISITOR.memory}`;
  return speech.speaking ? (
    <button
      type="button"
      onClick={speech.stop}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-deep px-4 text-sm font-semibold text-white hover:bg-forest-800"
    >
      <Square className="h-3.5 w-3.5" aria-hidden="true" />
      Stop
    </button>
  ) : (
    <button
      type="button"
      onClick={() => speech.speak(text, "demo")}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-forest/30 bg-white px-4 text-sm font-semibold text-forest hover:border-forest"
      aria-label="Listen to the last conversation"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      Listen
    </button>
  );
}

function Details({ scenario }: { scenario: DemoScenario }) {
  switch (scenario) {
    case "known":
      return (
        <>
          <StatusChip scenario="known" />
          <p className="mt-3 font-display text-3xl leading-tight text-deep">This is {DEMO_VISITOR.name}</p>
          <p className="mt-1 text-[17px] text-forest">
            {DEMO_VISITOR.relationship} · <span className="text-moss">visited {DEMO_VISITOR.lastVisit}</span>
          </p>
          <div className="mt-4 flex gap-4 rounded-2xl bg-mint/70 p-3">
            <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl ring-4 ring-white">
              <MemoryScene title={`Illustration: ${first} with his grandmother in the garden`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-moss">Last time you spoke</p>
              <p className="mt-1 text-[15px] leading-snug text-deep">{DEMO_VISITOR.memory}</p>
            </div>
          </div>
          <div className="mt-4">
            <ListenButton />
          </div>
        </>
      );
    case "uncertain":
      return (
        <>
          <StatusChip scenario="uncertain" />
          <p className="mt-3 font-display text-3xl leading-tight text-deep">This might be {first}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-moss">
            It's okay to ask their name. No photo, memories or details are shown until the match is confident.
          </p>
        </>
      );
    case "unknown":
      return (
        <>
          <StatusChip scenario="unknown" />
          <p className="mt-3 font-display text-3xl leading-tight text-deep">I don't recognise this person</p>
          <p className="mt-2 text-[15px] leading-relaxed text-moss">
            No name is guessed. A caregiver can add them later if they're a regular visitor.
          </p>
        </>
      );
    case "empty":
      return (
        <>
          <StatusChip scenario="empty" />
          <p className="mt-3 font-display text-3xl leading-tight text-deep">Waiting for a visitor</p>
          <p className="mt-2 text-[15px] leading-relaxed text-moss">
            When someone sits in front of the camera, the screen will say who it is.
          </p>
        </>
      );
  }
}

const SCENE = {
  known: { visitor: "daniel", box: "known", label: first, title: `Illustration of ${first}, marked as recognised` },
  uncertain: { visitor: "daniel", box: "uncertain", label: "Not sure", title: "Illustration of a visitor, marked as a possible match" },
  unknown: { visitor: "stranger", box: "unknown", label: "Unknown", title: "Illustration of an unfamiliar visitor, marked as unknown" },
  empty: { visitor: null, box: undefined, label: undefined, title: "Illustration of an empty living room" },
} as const;

/**
 * A simulated patient-screen preview. Always labelled as a simulation: it
 * never touches the camera or the real recognition engine.
 */
export function ProductPreview({ scenario, className }: { scenario: DemoScenario; className?: string }) {
  const scene = SCENE[scenario];
  return (
    <figure className={cn("rounded-[2rem] border border-forest/10 bg-cream p-4 shadow-lift sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3 px-1 pb-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-deep">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-white">
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
          </span>
          Patient screen
        </span>
        <span className="rounded-full bg-plum-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-plum-700">
          Simulation
        </span>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
        <div key={`scene-${scenario}`} className="site-swap h-full w-full">
          <CameraScene visitor={scene.visitor} box={scene.box} label={scene.label} title={scene.title} />
        </div>
        <span className="absolute bottom-3 left-3 rounded-full bg-deep/75 px-3 py-1 text-xs font-medium text-white">
          Illustrated scene · not a live camera
        </span>
      </div>
      <div key={`details-${scenario}`} className="site-swap px-1 pt-5" aria-live="polite">
        <Details scenario={scenario} />
      </div>
      <figcaption className="sr-only">Simulated example of the patient screen using fictional demo data.</figcaption>
    </figure>
  );
}
