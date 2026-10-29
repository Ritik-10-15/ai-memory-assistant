import type { ReactNode } from "react";
import {
  CameraOff,
  CheckCircle2,
  CircleHelp,
  Loader2,
  RefreshCw,
  ScanFace,
  UserRound,
  WifiOff,
} from "lucide-react";
import { api } from "@/api/client";
import { Avatar, Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import type { CameraProblem, PatientView } from "./recognitionView";
import { RecallCard } from "./RecallCard";

/** "Daughter" → "Your daughter"; leaves "My …"/"Your …" phrasing alone. */
export function relationshipPhrase(relationship: string | null): string | null {
  if (!relationship) return null;
  const r = relationship.trim();
  if (/^(your|my)\b/i.test(r)) return r.charAt(0).toUpperCase() + r.slice(1);
  return `Your ${r.toLowerCase()}`;
}

function StatusCard({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  tone: "calm" | "caution" | "neutral" | "problem";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const toneClass = {
    calm: "bg-brand-50 text-brand-600",
    caution: "bg-caution-50 text-caution-700",
    neutral: "bg-canvas text-ink-muted",
    problem: "bg-danger-50 text-danger-700",
  }[tone];
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
      <div className={cn("mb-6 flex h-20 w-20 items-center justify-center rounded-full", toneClass)}>{icon}</div>
      <h2 className="text-3xl font-semibold leading-tight text-navy sm:text-4xl">{title}</h2>
      {children && <div className="mt-4 max-w-lg text-xl leading-relaxed text-ink">{children}</div>}
      {action && <div className="mt-8">{action}</div>}
    </Card>
  );
}

const CAMERA_HELP: Record<CameraProblem, string> = {
  denied: "Camera access is turned off for this page. Please ask a caregiver to allow the camera, then reload.",
  unavailable: "No camera was found, or another app is using it. Please ask a caregiver to check the camera.",
  unsupported: "This browser can't use a camera. Please ask a caregiver to open the Memory Assistant in Chrome, Edge or Safari.",
  insecure: "The camera only works on a secure (https) page. Please ask a caregiver to check the address.",
};

const ICON = "h-10 w-10";

interface VisitorPanelProps {
  view: PatientView;
  speech: { supported: boolean; speaking: boolean; onRead: () => void; onStop: () => void };
}

export function VisitorPanel({ view, speech }: VisitorPanelProps) {
  switch (view.kind) {
    case "connecting":
      return (
        <StatusCard tone="calm" icon={<Loader2 className={cn(ICON, "animate-spin")} aria-hidden="true" />} title="Getting ready…">
          The memory assistant is starting up.
        </StatusCard>
      );

    case "service-unavailable":
      return (
        <StatusCard tone="neutral" icon={<WifiOff className={ICON} aria-hidden="true" />} title="I can't connect right now">
          I'll keep trying on my own. If this doesn't go away, please let a caregiver know.
        </StatusCard>
      );

    case "camera-unavailable":
      return (
        <StatusCard
          tone="problem"
          icon={<CameraOff className={ICON} aria-hidden="true" />}
          title="The camera isn't working"
          action={
            view.reason !== "unsupported" && (
              <Button
                size="xl"
                variant="secondary"
                icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />}
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            )
          }
        >
          {CAMERA_HELP[view.reason]}
        </StatusCard>
      );

    case "no-face":
      return (
        <StatusCard tone="calm" icon={<ScanFace className={ICON} aria-hidden="true" />} title="Waiting for a visitor">
          When someone sits in front of the camera, I'll tell you who it is.
        </StatusCard>
      );

    case "unknown":
      return (
        <StatusCard tone="neutral" icon={<UserRound className={ICON} aria-hidden="true" />} title="I don't recognise this person">
          It's perfectly fine to ask them who they are.
        </StatusCard>
      );

    case "uncertain":
      return (
        <StatusCard
          tone="caution"
          icon={<CircleHelp className={ICON} aria-hidden="true" />}
          title={`This might be ${view.name}`}
        >
          <Badge tone="warning" className="mb-3 px-3 py-1 text-sm">
            Not sure yet
          </Badge>
          <p>I'm not certain. It's okay to ask them their name.</p>
        </StatusCard>
      );

    case "known": {
      const relation = relationshipPhrase(view.relationship);
      const lastVisit = formatRelativeDay(view.lastVisitAt);
      return (
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-care-500" aria-hidden="true" />
            <div className="flex flex-col items-center gap-6 px-6 py-8 text-center sm:flex-row sm:items-center sm:text-left">
              <Avatar name={view.name} src={api.personPhotoUrl(view.personId)} size="xl" className="ring-4 ring-care-50" />
              <div className="min-w-0">
                <Badge tone="success" icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} className="px-3 py-1 text-sm">
                  Recognised
                </Badge>
                <h2 className="mt-3 break-words text-4xl font-bold leading-tight text-navy sm:text-5xl">
                  This is {view.name}
                </h2>
                {relation && <p className="mt-2 text-2xl text-ink">{relation}</p>}
                {lastVisit && (
                  <p className="mt-3 text-lg text-ink-muted">
                    You last saw {view.name.split(" ")[0]} {lastVisit}.
                  </p>
                )}
              </div>
            </div>
            {view.notes && (
              <div className="border-t border-line px-6 py-5 sm:px-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">About {view.name.split(" ")[0]}</h3>
                <p className="mt-1.5 text-xl leading-relaxed text-ink">{view.notes}</p>
              </div>
            )}
          </Card>
          <RecallCard
            name={view.name}
            lastMemory={view.lastMemory}
            lastMemoryAt={view.lastMemoryAt}
            earlier={view.earlierMemories}
            {...speech}
          />
        </div>
      );
    }
  }
}
