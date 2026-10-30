import { useEffect, useRef, type RefObject } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import type { FrameResult } from "@/api/types";
import { cn } from "@/lib/cn";
import { useFrame, type CameraStatus, type FrameStore } from "./useBrowserCamera";
import type { PatientView } from "./recognitionView";

const BOX_COLORS: Record<string, string> = {
  known: "#285744", // forest — matches the companion theme
  uncertain: "#A86F0C",
  unknown: "#5C6E65",
};

function boxLabel(view: PatientView): string {
  if (view.kind === "known") return view.name;
  if (view.kind === "uncertain") return "Not sure";
  if (view.kind === "unknown") return "Unknown";
  return "";
}

/** Draw the face box over an object-fit:cover <video>, mapping frame pixels to screen pixels. */
function drawOverlay(paper: HTMLCanvasElement, frame: FrameResult | null, view: PatientView) {
  const w = paper.clientWidth;
  const h = paper.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  paper.width = Math.round(w * dpr);
  paper.height = Math.round(h * dpr);
  const ctx = paper.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!frame?.box || !frame.width || !frame.height) return;

  const scale = Math.max(w / frame.width, h / frame.height);
  const ox = (w - frame.width * scale) / 2;
  const oy = (h - frame.height * scale) / 2;
  const [bx, by, bw, bh] = frame.box;
  const x = bx * scale + ox;
  const y = by * scale + oy;
  const color = BOX_COLORS[view.kind] ?? "#7C8E84";

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, bw * scale, bh * scale, 12);
  ctx.stroke();

  const label = boxLabel(view);
  if (label) {
    ctx.font = '600 16px "Inter Variable", Inter, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const ly = Math.max(0, y - 32);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, ly, tw + 20, 28, 8);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(label, x + 10, ly + 19);
  }
}

const STATUS_TEXT: Partial<Record<CameraStatus, string>> = {
  starting: "Starting camera…",
  live: "Camera on",
};

interface CameraPanelProps {
  mode: "browser" | "server" | undefined;
  videoRef: RefObject<HTMLVideoElement>;
  browserStatus: CameraStatus;
  frames: FrameStore;
  view: PatientView;
  serverFeedActive: boolean;
  onServerFeedError: () => void;
}

export function CameraPanel({
  mode,
  videoRef,
  browserStatus,
  frames,
  view,
  serverFeedActive,
  onServerFeedError,
}: CameraPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useFrame(frames);

  useEffect(() => {
    if (canvasRef.current && mode === "browser") drawOverlay(canvasRef.current, frame, view);
  }, [frame, view, mode]);

  const problem = view.kind === "camera-unavailable";
  const chip =
    mode === "server"
      ? problem
        ? "Camera unavailable"
        : "Camera on"
      : problem
        ? "Camera unavailable"
        : STATUS_TEXT[browserStatus];

  return (
    <section aria-label="Camera" className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-ink shadow-card">
        {mode === "browser" && (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              aria-hidden="true"
              className={cn("h-full w-full object-cover", problem && "invisible")}
            />
            <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
          </>
        )}
        {mode === "server" && serverFeedActive && !problem && (
          <img
            src="/video"
            alt="Live camera view"
            className="h-full w-full object-cover"
            onError={onServerFeedError}
          />
        )}
        {(problem || !mode || browserStatus === "starting") && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            {problem ? (
              <CameraOff className="h-12 w-12" aria-hidden="true" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin" aria-hidden="true" />
            )}
          </div>
        )}
        {chip && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink/75 px-3 py-1 text-sm font-medium text-white">
            {problem ? (
              <CameraOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Camera className="h-4 w-4" aria-hidden="true" />
            )}
            {chip}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted">
        The camera is only used to recognise visitors. Video is not recorded.
      </p>
    </section>
  );
}
