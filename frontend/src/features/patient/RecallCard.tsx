import { MessageCircle, Square, Volume2 } from "lucide-react";
import type { MemorySnippet } from "@/api/types";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";

interface RecallCardProps {
  name: string;
  lastMemory: string | null;
  lastMemoryAt: string | null;
  earlier: MemorySnippet[];
  supported: boolean;
  speaking: boolean;
  onRead: () => void;
  onStop: () => void;
}

/** The last conversation: always visible as text; reading aloud is opt-in and stoppable. */
export function RecallCard({ name, lastMemory, lastMemoryAt, earlier, supported, speaking, onRead, onStop }: RecallCardProps) {
  const first = name.split(" ")[0];
  if (!lastMemory) {
    return (
      <Card className="px-6 py-6 sm:px-8">
        <h3 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
          Last conversation
        </h3>
        <p className="mt-2 text-xl text-ink-muted">There's no saved conversation with {first} yet.</p>
      </Card>
    );
  }

  const when = formatRelativeDay(lastMemoryAt);
  return (
    <Card className={cn("px-6 py-6 sm:px-8", speaking && "ring-2 ring-brand-500")}>
      <h3 className="flex items-start gap-2 text-xl font-semibold text-navy">
        <MessageCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <span>
          Last time you spoke
          {when && <span className="font-normal text-ink-muted">, {when}</span>}
        </span>
      </h3>
      <p className="mt-3 whitespace-pre-line text-2xl leading-relaxed text-ink">{lastMemory}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {supported ? (
          speaking ? (
            <Button size="xl" variant="danger" icon={<Square className="h-6 w-6" aria-hidden="true" />} onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button size="xl" icon={<Volume2 className="h-7 w-7" aria-hidden="true" />} onClick={onRead}>
              Read aloud
            </Button>
          )
        ) : (
          <p className="text-lg text-ink-muted">Reading aloud isn't available in this browser.</p>
        )}
        <span role="status" className="text-lg text-ink-muted">
          {speaking ? "Reading aloud… press Stop at any time." : ""}
        </span>
      </div>

      {earlier.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Earlier conversations</h4>
          <ul className="mt-2 space-y-3">
            {earlier.map((m, i) => (
              <li key={`${m.when}-${i}`} className="text-lg leading-relaxed text-ink">
                {m.summary}
                {m.when && <span className="ml-2 text-base text-ink-muted">({formatRelativeDay(m.when)})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
