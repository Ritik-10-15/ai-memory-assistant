import { Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Read Aloud / Stop for the patient screen. Playback is always started by
 * the person (never automatically), Stop is the same large target in the
 * same place, and the current state is announced politely.
 */
export function AudioControls({
  supported,
  speaking,
  onPlay,
  onStop,
  playLabel = "Read aloud",
}: {
  supported: boolean;
  speaking: boolean;
  onPlay: () => void;
  onStop: () => void;
  playLabel?: string;
}) {
  if (!supported) {
    return <p className="text-lg text-ink-muted">Reading aloud isn't available in this browser.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {speaking ? (
        <Button size="xl" variant="danger" icon={<Square className="h-6 w-6" aria-hidden="true" />} onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button size="xl" icon={<Volume2 className="h-7 w-7" aria-hidden="true" />} onClick={onPlay}>
          {playLabel}
        </Button>
      )}
      <span role="status" className="text-lg text-ink-muted">
        {speaking ? "Reading aloud… press Stop at any time." : ""}
      </span>
    </div>
  );
}
