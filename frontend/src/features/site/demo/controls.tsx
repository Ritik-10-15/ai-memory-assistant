import type { KeyboardEvent, MutableRefObject } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { isFirst, isLast, SCENARIOS, SCORE_HIGH, SCORE_MEDIUM, type DemoAction, type DemoState } from "./model";

// ── ScenarioSelector ─────────────────────────────────────────────────
/** Radio group of the five scenarios; arrow keys move and select. */
export function ScenarioSelector({
  current,
  onSelect,
  radioRefs,
}: {
  current: number;
  onSelect: (i: number) => void;
  radioRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
}) {
  function onKeyDown(e: KeyboardEvent) {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next: number | undefined;
    if (dir) next = (current + dir + SCENARIOS.length) % SCENARIOS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = SCENARIOS.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    onSelect(next);
    radioRefs.current[next]?.focus();
  }

  return (
    <div>
      <p id="scenario-label" className="text-sm font-semibold uppercase tracking-wider text-moss">
        Choose a scenario
      </p>
      <div
        role="radiogroup"
        aria-labelledby="scenario-label"
        onKeyDown={onKeyDown}
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        {SCENARIOS.map((s, i) => {
          const selected = i === current;
          return (
            <button
              key={s.id}
              ref={(el) => {
                radioRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-describedby={`scenario-${s.id}-summary`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(i)}
              className={cn(
                "group flex min-h-[4.5rem] items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                selected ? "border-forest bg-forest text-white" : "border-forest/15 bg-cream text-deep hover:border-forest/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-lg",
                  selected ? "bg-cream text-forest" : "bg-mint-100 text-forest",
                )}
              >
                {s.letter}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug">{s.title}</span>
                <span id={`scenario-${s.id}-summary`} className={cn("mt-0.5 block text-[13px] leading-snug", selected ? "text-mint-100" : "text-moss")}>
                  {s.summary}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DemoProgress ─────────────────────────────────────────────────────
/** The steps of the current scenario; any step can be jumped to. */
export function DemoProgress({ state, onGoto }: { state: DemoState; onGoto: (frame: number) => void }) {
  const scenario = SCENARIOS[state.scenario];
  return (
    <nav aria-label={`Steps in scenario ${scenario.letter}`}>
      <ol className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 sm:gap-2">
        {scenario.frames.map((f, i) => {
          const done = i < state.frame;
          const current = i === state.frame;
          return (
            <li key={f.step}>
              <button
                type="button"
                onClick={() => onGoto(i)}
                aria-current={current ? "step" : undefined}
                className="group flex w-full flex-col items-start gap-2 rounded-xl p-1 text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors duration-300",
                    current ? "bg-plum" : done ? "bg-forest" : "bg-forest/15 group-hover:bg-forest/30",
                  )}
                />
                <span className={cn("flex items-center gap-1 text-[13px] leading-tight", current ? "font-semibold text-deep" : "text-moss")}>
                  {done && <Check className="h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />}
                  <span className="sr-only">Step {i + 1}: </span>
                  {f.step}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── DemoNavigation ───────────────────────────────────────────────────
export function DemoNavigation({ state, dispatch }: { state: DemoState; dispatch: (a: DemoAction) => void }) {
  const scenario = SCENARIOS[state.scenario];
  const lastFrame = state.frame === scenario.frames.length - 1;
  const nextLabel = isLast(state) ? "End of the demo" : lastFrame ? `Next: scenario ${SCENARIOS[state.scenario + 1].letter}` : "Next step";
  const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => dispatch({ type: "prev" })}
        disabled={isFirst(state)}
        className={cn(base, "border border-forest/30 bg-white text-forest hover:border-forest")}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        Previous
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "next" })}
        disabled={isLast(state)}
        className={cn(base, "bg-plum text-white shadow-soft hover:bg-plum-700")}
      >
        {nextLabel}
        {!isLast(state) && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "restart" })}
        className={cn(base, "px-3 text-forest underline-offset-4 hover:underline")}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Restart demo
      </button>
    </div>
  );
}

// ── ScoreMeter ───────────────────────────────────────────────────────
/** Where a simulated similarity score falls against the real thresholds. */
export function ScoreMeter({ score }: { score: number | null }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-deep">Best-match similarity (simulated)</span>
        <span className="font-mono text-base font-semibold tabular-nums text-deep">
          {score === null ? "—" : score.toFixed(2)}
        </span>
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
        {/* labels sit either side of their tick so they never collide */}
        <span className="absolute -translate-x-full pr-1" style={{ left: pct(SCORE_MEDIUM) }}>
          {SCORE_MEDIUM.toFixed(2)}
        </span>
        <span className="absolute pl-1" style={{ left: pct(SCORE_HIGH) }}>
          {SCORE_HIGH.toFixed(2)}
        </span>
      </div>
      <p className="mt-3 text-sm text-moss">
        {score === null ? "No face is being compared on this step. " : ""}Below {SCORE_MEDIUM.toFixed(2)} is unknown,{" "}
        {SCORE_MEDIUM.toFixed(2)}–{SCORE_HIGH.toFixed(2)} a possible match, {SCORE_HIGH.toFixed(2)}+ confident — the real engine's thresholds.
      </p>
    </div>
  );
}
