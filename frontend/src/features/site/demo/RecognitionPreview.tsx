import { HeartHandshake } from "lucide-react";
import { CameraScene, type BoxStyle } from "../Illustration";
import { FamilyMemoryCard, MemoryPlaceholder, MemoryRecallCard, RecognitionStatus, VisitorProfileCard } from "./cards";
import type { DemoFrame, DemoView } from "./model";

function sceneFor(frame: DemoFrame, view: DemoView): { box?: BoxStyle; label?: string; title: string } {
  const first = view.person?.name.split(" ")[0];
  switch (frame.status) {
    case "detecting":
      return { box: "detecting", title: "Illustrated camera view: a face has been detected and is being identified" };
    case "known":
      return { box: "known", label: first, title: `Illustrated camera view: ${first} is recognised` };
    case "holding":
      return { box: "holding", label: first, title: `Illustrated camera view: ${first} is stepping out of view` };
    case "uncertain":
      return { box: "uncertain", label: "Not sure", title: "Illustrated camera view: a dimly lit visitor, a possible match only" };
    case "unknown":
      return { box: "unknown", label: "Unknown", title: "Illustrated camera view: an unfamiliar visitor, not recognised" };
    case "idle":
      return { title: "Illustrated camera view: an empty living room" };
  }
}

/**
 * The patient screen, framed as a tablet. Everything inside is derived
 * from the current frame — the camera overlay, the visitor and the memory.
 */
export function RecognitionPreview({ frame, view, frameKey, dim }: { frame: DemoFrame; view: DemoView; frameKey: string; dim: boolean }) {
  const scene = sceneFor(frame, view);
  return (
    <figure className="rounded-[2.4rem] bg-deep p-2.5 shadow-lift sm:p-3.5">
      <div className="overflow-hidden rounded-[1.8rem] bg-cream">
        {/* tablet status bar */}
        <div className="flex items-center justify-between gap-3 border-b border-forest/10 px-5 py-3">
          <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-deep">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-white">
              <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            </span>
            Memory Assistant
          </span>
          <span className="rounded-full bg-plum-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-plum-700">
            Simulation
          </span>
        </div>

        {/* Phones: camera → who → conversation → memory. Wider: camera and
            memory on the left, who and conversation on the right. */}
        <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] md:grid-rows-[auto_1fr]">
          <div className="md:col-start-1 md:row-start-1">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              <div key={`scene-${frameKey}`} className="site-swap h-full w-full">
                <CameraScene visitor={frame.inView} leaving={frame.leaving} dim={dim} box={scene.box} label={scene.label} title={scene.title} />
              </div>
              <span className="absolute bottom-2.5 left-2.5 rounded-full bg-deep/75 px-2.5 py-1 text-[11px] font-medium text-white">
                Illustrated · not a live camera
              </span>
            </div>
            <div className="mt-3">
              <RecognitionStatus status={frame.status} />
            </div>
          </div>

          <div key={`info-${frameKey}`} className="site-swap min-w-0 space-y-5 md:col-start-2 md:row-span-2 md:row-start-1">
            <VisitorProfileCard view={view} />
            {view.showRecall && view.person ? (
              <MemoryRecallCard person={view.person} frameKey={frameKey} />
            ) : (
              <MemoryPlaceholder view={view} recall={frame.recall} />
            )}
          </div>

          {view.showRecall && view.person && (
            <div key={`memory-${frameKey}`} className="site-swap md:col-start-1 md:row-start-2">
              <FamilyMemoryCard person={view.person} />
            </div>
          )}
        </div>
      </div>
      <figcaption className="sr-only">Simulated patient screen with fictional people.</figcaption>
    </figure>
  );
}
