import { useEffect, useReducer, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Reveal, SectionIntro } from "../ui";
import { statusText } from "./cards";
import { DemoNavigation, DemoProgress, ScenarioSelector, ScoreMeter } from "./controls";
import { deriveView, demoReducer, INITIAL_STATE, SCENARIOS, type DemoAction } from "./model";
import { RecognitionPreview } from "./RecognitionPreview";

/**
 * The interactive product demo on the public homepage.
 * State lives in a reducer (model.ts); the screen is derived from the
 * current frame. No camera, no backend, fictional people only.
 */
export function DemoExperience() {
  const [state, rawDispatch] = useReducer(demoReducer, INITIAL_STATE);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scenario = SCENARIOS[state.scenario];
  const frame = scenario.frames[state.frame];
  const view = deriveView(frame);
  const frameKey = `${scenario.id}-${state.frame}`;
  const dim = scenario.id === "uncertain" && frame.status !== "known";

  const dispatch = (a: DemoAction) => {
    rawDispatch(a);
    // After restarting, put the keyboard back at the start of the demo.
    if (a.type === "restart") requestAnimationFrame(() => radioRefs.current[0]?.focus());
  };

  // Screen readers hear each change once, in plain words.
  const [announcement, setAnnouncement] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const who = view.person ? `${view.person.name}, ${view.person.relationship.toLowerCase()}.` : "";
    setAnnouncement(
      `Scenario ${scenario.letter}, ${scenario.title}. Step ${state.frame + 1} of ${scenario.frames.length}: ${frame.step}. ${statusText(frame.status)}. ${who}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return (
    <section aria-labelledby="demo" className="bg-mint py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro id="demo" eyebrow="Interactive demo" title="Recognise, identify, remember, reconnect">
              Step through five real situations and watch what the patient sees — including what it refuses to show.
              Everything runs in your browser.
            </SectionIntro>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-plum bg-cream px-4 py-2 text-sm font-bold uppercase tracking-wider text-plum-700">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Simulation / Demo mode
            </p>
          </div>
        </Reveal>

        <div className="mt-10">
          <ScenarioSelector current={state.scenario} onSelect={(i) => dispatch({ type: "select", scenario: i })} radioRefs={radioRefs} />
        </div>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10">
          <RecognitionPreview frame={frame} view={view} frameKey={frameKey} dim={dim} />

          <div className="space-y-6 rounded-[1.75rem] border border-forest/10 bg-cream p-6 shadow-soft sm:p-7 lg:sticky lg:top-24">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-plum-700">
                Scenario {scenario.letter} · step {state.frame + 1} of {scenario.frames.length}
              </p>
              <h3 className="mt-1 font-display text-3xl leading-tight text-deep">{scenario.title}</h3>
            </div>
            <DemoProgress state={state} onGoto={(f) => dispatch({ type: "goto", frame: f })} />
            <div key={frameKey} className="site-swap space-y-5 border-t border-forest/10 pt-5">
              <div>
                <h4 className="text-lg font-semibold text-deep">{frame.step}</h4>
                <p className="mt-1.5 leading-relaxed text-moss">{frame.explain}</p>
              </div>
              <ScoreMeter score={frame.score} />
            </div>
            <DemoNavigation state={state} dispatch={dispatch} />
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-moss">
          Fictional people and illustrated scenes. The real app uses a live camera and your family's own records.
        </p>
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="demo-announcer">
        {announcement}
      </div>
    </section>
  );
}
