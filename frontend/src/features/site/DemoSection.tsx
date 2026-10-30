import { useRef, useState, type KeyboardEvent } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { SCENARIO_ORDER, SCENARIOS, SCORE_HIGH, SCORE_MEDIUM, type DemoScenario } from "./demoData";
import { ProductPreview } from "./ProductPreview";
import { Reveal, SectionIntro } from "./ui";

/** The similarity meter: where a simulated score falls against the real thresholds. */
function ScoreMeter({ score }: { score: number | null }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-deep">Best-match similarity (simulated)</span>
        <span className="font-mono text-base font-semibold tabular-nums text-deep">{score === null ? "no face" : score.toFixed(2)}</span>
      </div>
      <div className="relative mt-3 h-3 rounded-full bg-mint-100" aria-hidden="true">
        <div className="absolute inset-y-0 rounded-full bg-[#F2C14E]/50" style={{ left: pct(SCORE_MEDIUM), width: pct(SCORE_HIGH - SCORE_MEDIUM) }} />
        <div className="absolute inset-y-0 right-0 rounded-r-full bg-forest/20" style={{ left: pct(SCORE_HIGH) }} />
        {score !== null && (
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-cream bg-plum shadow-soft transition-[left] duration-500"
            style={{ left: pct(score) }}
          />
        )}
      </div>
      <div className="relative mt-2 h-4 text-xs text-moss" aria-hidden="true">
        <span className="absolute -translate-x-1/2" style={{ left: pct(SCORE_MEDIUM) }}>
          {SCORE_MEDIUM.toFixed(2)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(SCORE_HIGH) }}>
          {SCORE_HIGH.toFixed(2)}
        </span>
      </div>
      <p className="mt-3 text-sm text-moss">
        Below {SCORE_MEDIUM.toFixed(2)}: unknown · {SCORE_MEDIUM.toFixed(2)}–{SCORE_HIGH.toFixed(2)}: possible match · {SCORE_HIGH.toFixed(2)}+:
        confident. These are the thresholds the real engine uses.
      </p>
    </div>
  );
}

export function DemoSection() {
  const [scenario, setScenario] = useState<DemoScenario>("known");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const info = SCENARIOS[scenario];

  // Radio-group keyboard pattern: arrows move between scenarios.
  function onKeyDown(e: KeyboardEvent) {
    const i = SCENARIO_ORDER.indexOf(scenario);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = SCENARIO_ORDER[(i + step + SCENARIO_ORDER.length) % SCENARIO_ORDER.length];
    setScenario(next);
    refs.current[next]?.focus();
  }

  return (
    <section aria-labelledby="demo" className="bg-mint py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro id="demo" eyebrow="Try it" title="See how it behaves when it's sure — and when it isn't">
              Switch between situations to see what the patient would see. This runs entirely in your browser.
            </SectionIntro>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-plum bg-cream px-4 py-2 text-sm font-bold uppercase tracking-wider text-plum-700">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Simulation / Demo mode
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <Reveal>
            <div className="rounded-[1.75rem] border border-forest/10 bg-cream p-6 shadow-soft sm:p-8">
              <p id="scenario-label" className="text-sm font-semibold uppercase tracking-wider text-moss">
                Choose a situation
              </p>
              <div role="radiogroup" aria-labelledby="scenario-label" className="mt-4 grid gap-2 sm:grid-cols-2" onKeyDown={onKeyDown}>
                {SCENARIO_ORDER.map((s) => {
                  const selected = s === scenario;
                  return (
                    <button
                      key={s}
                      ref={(el) => {
                        refs.current[s] = el;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setScenario(s)}
                      className={cn(
                        "min-h-12 rounded-2xl border px-4 py-3 text-left text-[15px] font-semibold transition-colors",
                        selected ? "border-forest bg-forest text-white" : "border-forest/20 bg-white text-deep hover:border-forest/50",
                      )}
                    >
                      {SCENARIOS[s].label}
                    </button>
                  );
                })}
              </div>

              <div key={scenario} className="site-swap mt-8 border-t border-forest/10 pt-7">
                <h3 className="font-display text-2xl text-deep">{info.title}</h3>
                <p className="mt-2 leading-relaxed text-moss">{info.explain}</p>
                <div className="mt-6">
                  <ScoreMeter score={info.score} />
                </div>
              </div>

              {scenario !== "known" && (
                <button
                  type="button"
                  onClick={() => setScenario("known")}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-[15px] font-semibold text-forest underline-offset-4 hover:underline"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Back to the familiar visitor
                </button>
              )}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <ProductPreview scenario={scenario} />
            <p className="mt-4 text-center text-sm text-moss">
              Fictional people and illustrated scenes. The real app uses a live camera and your family's own records.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
