import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BookHeart, BookImage, HeartHandshake, House, Users } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { usePageVisible } from "@/hooks/usePageVisible";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import { AlbumShelfPage } from "./album/AlbumShelfPage";
import { AlbumViewPage } from "./album/AlbumViewPage";
import { FamilyPage } from "./album/FamilyPage";
import { FamilyStrip } from "./album/FamilyStrip";
import { FeaturedMemory } from "./album/FeaturedMemory";
import { MemoriesPage } from "./album/MemoriesPage";
import { PersonPage } from "./album/PersonPage";
import { PersonPhoto } from "./album/pieces";
import { CameraPanel } from "./CameraPanel";
import { CameraStatus } from "./CameraStatus";
import {
  announcementFor,
  derivePatientView,
  FAILURES_BEFORE_UNAVAILABLE,
  viewKey,
  type CameraProblem,
  type PatientView,
} from "./recognitionView";
import { useBrowserCamera } from "./useBrowserCamera";
import { usePageTitle } from "./usePageTitle";
import { useRecognition } from "./useRecognition";
import { trimForSpeech, useSpeech, type Speech } from "./useSpeech";
import { VisitorNotes } from "./VisitorNotes";
import { VisitorPanel } from "./VisitorPanel";

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const NAV = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/family", label: "Family", icon: Users, end: false },
  { to: "/albums", label: "Albums", icon: BookImage, end: false },
  { to: "/memories", label: "Memories", icon: BookHeart, end: false },
];

function PatientNav({ className, variant }: { className?: string; variant: "top" | "bottom" }) {
  return (
    <nav aria-label={variant === "top" ? "Main" : "Main menu"} className={className}>
      <ul className={cn("flex", variant === "top" ? "gap-2" : "justify-around")}>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className={variant === "bottom" ? "flex-1" : undefined}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center font-semibold transition-colors",
                  variant === "top"
                    ? "min-h-12 gap-2 rounded-full px-5 text-lg"
                    : "min-h-16 flex-col gap-1 rounded-2xl text-base",
                  isActive ? "bg-primary-700 text-white" : "text-ink hover:bg-primary-50",
                )
              }
            >
              <Icon className={variant === "top" ? "h-5 w-5" : "h-7 w-7"} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** On Family/Memories: a gentle note that someone has arrived — never a sudden page change. */
function VisitorBanner({ view }: { view: PatientView }) {
  const navigate = useNavigate();
  if (!["known", "uncertain", "unknown"].includes(view.kind)) return null;
  const known = view.kind === "known";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-sage-200 bg-sage-50 p-4 pr-5">
      {known && <PersonPhoto id={view.personId} name={view.name} aspect="aspect-square" className="w-16 shrink-0 p-1" />}
      <p className="flex-1 font-serif text-2xl font-semibold text-ink">
        {known ? `${view.name} is here` : "Someone is here"}
      </p>
      <Button size="lg" onClick={() => navigate("/")}>
        See who's visiting
      </Button>
    </div>
  );
}

function HomeVisitor({
  view,
  speech,
  readAloud,
  notes,
}: {
  view: PatientView;
  speech: Speech;
  readAloud: () => void;
  notes: ReactNode;
}) {
  const now = useNow(60_000);
  usePageTitle("Home");
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold text-ink sm:text-5xl">{greeting(now)}</h1>
      <section id="visitor" tabIndex={-1} aria-labelledby="visiting-heading" className="space-y-5 outline-none">
        <h2 id="visiting-heading" className="font-sans text-lg font-bold uppercase tracking-wide text-ink-muted">
          Who's visiting?
        </h2>
        <VisitorPanel
          view={view}
          voice={speech}
          speech={{
            supported: speech.supported,
            speaking: speech.speakingId === "visitor",
            onRead: readAloud,
            onStop: speech.stop,
          }}
        />
        {notes}
      </section>
      <FamilyStrip />
    </div>
  );
}

const CAMERA_PROBLEMS: ReadonlySet<string> = new Set(["denied", "unavailable", "unsupported", "insecure"]);

/**
 * The patient app: Home ("Who's visiting?"), Family and Memories.
 *
 * Recognition (polling + camera) lives here, above the pages, so it keeps
 * running whichever tab is open: the camera element stays mounted in the
 * same place and is only visually tucked away off the Home page.
 */
export function PatientScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const visible = usePageVisible();
  const now = useNow();

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

  // ── Read aloud: one voice for the whole app ─────────────────────
  const speech = useSpeech();
  const { stop: stopSpeech, speakingId } = speech;
  // Anything read aloud about the visitor (the recap, or one of their photos:
  // ids starting "visitor") stops the moment the situation changes — a
  // different visitor, an unknown face, nobody, or an outage.
  useEffect(() => {
    if (speakingId?.startsWith("visitor")) stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Anything stops when the page changes or the tab is hidden.
  useEffect(() => stopSpeech(), [location.pathname, stopSpeech]);
  useEffect(() => {
    if (!visible) stopSpeech();
  }, [visible, stopSpeech]);

  const readAloud = useCallback(() => {
    if (view.kind !== "known" || !view.lastMemory) return;
    const when = formatRelativeDay(view.lastMemoryAt);
    speech.speak(`Last time you spoke with ${view.name}${when ? `, ${when}` : ""}. ${trimForSpeech(view.lastMemory)}`, "visitor");
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
  const notes =
    notesTarget && (view.kind === "known" || notesBusy) ? (
      <VisitorNotes
        personId={notesTarget.personId}
        name={notesTarget.name}
        voiceAvailable={Boolean(status.data?.voice_memos)}
        onBusyChange={setNotesBusy}
      />
    ) : null;

  return (
    <div className="theme-companion min-h-screen bg-paper pb-28 font-sans text-ink lg:pb-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-5 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-raised"
      >
        Skip to main content
      </a>

      <header className="border-b border-line bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3 rounded-full">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-700 text-white">
              <HeartHandshake className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="sr-only font-serif text-xl font-semibold text-ink sm:not-sr-only">Memory Assistant</span>
          </Link>
          <PatientNav variant="top" className="hidden lg:block" />
          <div className="flex items-center gap-4 text-right">
            <CameraStatus view={view} className="hidden md:inline-flex" />
            <p className="leading-tight">
              <span className="block text-base font-semibold text-ink sm:text-lg">
                {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <span className="block text-base text-ink-muted">
                {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </p>
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:py-8",
          isHome && "grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0">
          {!isHome && <VisitorBanner view={view} />}
          <Routes>
            <Route index element={<HomeVisitor view={view} speech={speech} readAloud={readAloud} notes={notes} />} />
            <Route path="family" element={<FamilyPage />} />
            <Route path="family/:id" element={<PersonPage speech={speech} />} />
            <Route path="albums" element={<AlbumShelfPage />} />
            <Route path="albums/:id" element={<AlbumViewPage speech={speech} />} />
            <Route path="memories" element={<MemoriesPage speech={speech} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Same element on every page so the camera never restarts; off Home
            it is tucked away visually but keeps feeding recognition. */}
        <aside
          aria-label="Camera and featured memory"
          aria-hidden={!isHome || undefined}
          className={cn(
            "space-y-6",
            !isHome && "pointer-events-none fixed -left-[200vw] top-0 h-px w-px overflow-hidden opacity-0",
          )}
        >
          <CameraPanel
            mode={cameraMode}
            videoRef={videoRef}
            browserStatus={camera.status}
            frame={camera.frame}
            view={view}
            serverFeedActive={visible}
            onServerFeedError={() => setServerFeedFailed(true)}
          />
          {isHome && <FeaturedMemory speech={speech} />}
        </aside>
      </main>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-base text-ink-muted sm:px-6">
        <Link to="/caregiver" className="rounded font-semibold text-primary-700 underline-offset-4 hover:underline">
          Caregiver sign-in
        </Link>
      </footer>

      <PatientNav
        variant="bottom"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-2 py-2 shadow-raised backdrop-blur lg:hidden"
      />
    </div>
  );
}
