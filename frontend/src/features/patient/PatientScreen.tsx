import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { useAsync } from "@/hooks/useAsync";
import { usePageVisible } from "@/hooks/usePageVisible";
import { formatRelativeDay } from "@/lib/format";
import { CameraPanel } from "./CameraPanel";
import {
  announcementFor,
  derivePatientView,
  FAILURES_BEFORE_UNAVAILABLE,
  viewKey,
  type CameraProblem,
} from "./recognitionView";
import { useBrowserCamera } from "./useBrowserCamera";
import { useRecognition } from "./useRecognition";
import { trimForSpeech, useSpeech } from "./useSpeech";
import { VisitorNotes } from "./VisitorNotes";
import { VisitorPanel } from "./VisitorPanel";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="text-right leading-tight">
      <span className="block text-lg font-semibold text-navy sm:text-xl">
        {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </span>
      <span className="block text-base text-ink-muted sm:text-lg">
        {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
    </p>
  );
}

const CAMERA_PROBLEMS: ReadonlySet<string> = new Set(["denied", "unavailable", "unsupported", "insecure"]);

export function PatientScreen() {
  const navigate = useNavigate();
  const visible = usePageVisible();

  // App configuration (camera mode, voice availability). Retry until it loads.
  const status = useAsync(() => api.status(), []);
  useEffect(() => {
    if (!status.error) return;
    if (status.error instanceof ApiError && status.error.isUnauthorized) {
      navigate("/patient/login", { replace: true });
      return;
    }
    const t = setTimeout(status.reload, 5000);
    return () => clearTimeout(t);
  }, [status.error, status.reload, navigate]);
  const cameraMode = status.data?.camera_mode;

  const feed = useRecognition(visible);
  useEffect(() => {
    if (feed.unauthorized) navigate("/patient/login", { replace: true });
  }, [feed.unauthorized, navigate]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useBrowserCamera(videoRef, visible && cameraMode === "browser");
  const [serverFeedFailed, setServerFeedFailed] = useState(false);

  let cameraProblem: CameraProblem | null = null;
  if (cameraMode === "browser" && CAMERA_PROBLEMS.has(camera.status)) cameraProblem = camera.status as CameraProblem;
  if (cameraMode === "server" && serverFeedFailed) cameraProblem = "unavailable";

  // If even the status request is failing, the service is down — don't show
  // a detection we can't trust.
  const statusDown = Boolean(status.error) && !(status.error instanceof ApiError && status.error.isUnauthorized);
  const view = derivePatientView({
    detection: statusDown ? null : feed.detection,
    failures: statusDown ? FAILURES_BEFORE_UNAVAILABLE : feed.failures,
    cameraProblem,
  });
  const key = viewKey(view);

  // ── Read aloud ─────────────────────────────────────────────────
  const speech = useSpeech();
  const { stop: stopSpeech } = speech;
  // Stop speaking the moment the situation changes (a different visitor,
  // an unknown face, nobody, or an outage) or the page is hidden.
  useEffect(() => {
    stopSpeech();
  }, [key, stopSpeech]);
  useEffect(() => {
    if (!visible) stopSpeech();
  }, [visible, stopSpeech]);

  const readAloud = useCallback(() => {
    if (view.kind !== "known" || !view.lastMemory) return;
    const when = formatRelativeDay(view.lastMemoryAt);
    speech.speak(`Last time you spoke with ${view.name}${when ? `, ${when}` : ""}. ${trimForSpeech(view.lastMemory)}`);
  }, [view, speech]);

  // ── Screen-reader announcement, only when the situation changes ──
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    setAnnouncement(announcementFor(view));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Visitor notes stay open while a draft or recording is in progress ──
  const [notesTarget, setNotesTarget] = useState<{ personId: string; name: string } | null>(null);
  const [notesBusy, setNotesBusy] = useState(false);
  useEffect(() => {
    if (view.kind === "known") setNotesTarget({ personId: view.personId, name: view.name });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const showNotes = notesTarget && (view.kind === "known" || notesBusy);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#visitor"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-navy focus:shadow-raised"
      >
        Skip to visitor information
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
              <HeartHandshake className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-navy sm:text-2xl">Memory Assistant</h1>
          </div>
          <Clock />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:py-8">
        <div id="visitor" tabIndex={-1} className="space-y-5 outline-none">
          <VisitorPanel
            view={view}
            speech={{ supported: speech.supported, speaking: speech.speaking, onRead: readAloud, onStop: speech.stop }}
          />
          {showNotes && (
            <VisitorNotes
              personId={notesTarget.personId}
              name={notesTarget.name}
              voiceAvailable={Boolean(status.data?.voice_memos)}
              onBusyChange={setNotesBusy}
            />
          )}
        </div>
        <CameraPanel
          mode={cameraMode}
          videoRef={videoRef}
          browserStatus={camera.status}
          frame={camera.frame}
          view={view}
          serverFeedActive={visible}
          onServerFeedError={() => setServerFeedFailed(true)}
        />
      </main>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-sm text-ink-muted sm:px-6">
        <Link to="/caregiver" className="rounded font-medium text-brand-600 underline-offset-4 hover:underline">
          Caregiver sign-in
        </Link>
      </footer>
    </div>
  );
}
