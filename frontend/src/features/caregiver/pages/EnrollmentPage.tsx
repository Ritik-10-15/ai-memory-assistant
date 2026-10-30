import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Camera, CameraOff, CheckCircle2, Loader2, Pause, Play, ScanFace, Upload } from "lucide-react";
import { api, ApiError } from "@/api/client";
import type { EnrollReason, Person, PhotoResult } from "@/api/types";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  TextField,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAsync } from "@/hooks/useAsync";
import { ENROLL_MESSAGES, EnrollmentBadge, PageHeader, PhotoPicker, PhotoResults } from "../components";
import { cameraProblemFrom, grabJpeg, openCamera } from "@/features/patient/useBrowserCamera";

/** Captures per session — the server refreshes the gallery from 10 photos on. */
export const CAPTURE_TARGET = 12;
const CAPTURE_GAP_MS = 800;

const CAMERA_ERRORS: Record<string, string> = {
  denied: "Camera access was blocked. Allow the camera for this site in the browser's address bar, then try again.",
  unavailable: "No camera was found, or another app is using it.",
};

type Feedback = { tone: "info" | "success" | "warning" | "error"; text: string };

export function LiveCapture({
  person,
  cameraMode,
  onCaptured,
}: {
  person: Person;
  cameraMode: "browser" | "server";
  /** Called with the running total after each accepted capture. */
  onCaptured: (count: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">(cameraMode === "server" ? "ready" : "starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (captured > 0) onCaptured(captured);
  }, [captured, onCaptured]);

  // Open the browser camera for the lifetime of this page.
  useEffect(() => {
    if (cameraMode !== "browser") return;
    let stream: MediaStream | undefined;
    let cancelled = false;
    openCamera()
      .then(async (s) => {
        stream = s;
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
        setCameraState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraState("error");
        setCameraError(CAMERA_ERRORS[cameraProblemFrom(err)] ?? CAMERA_ERRORS.unavailable);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraMode]);

  // Capture loop: one request at a time while running.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    canvasRef.current ??= document.createElement("canvas");

    const step = async () => {
      let frame: Blob | null = null;
      if (cameraMode === "browser") {
        frame = videoRef.current ? await grabJpeg(videoRef.current, canvasRef.current!, 0.92) : null;
        if (!frame) {
          if (!stopped) timer = setTimeout(step, CAPTURE_GAP_MS);
          return;
        }
      }
      try {
        const result = await api.enrollCapture(person.id, frame);
        failures = 0;
        if (stopped) return;
        if (result.success) {
          setCaptured((c) => {
            const next = c + 1;
            if (next >= CAPTURE_TARGET) setRunning(false);
            return next;
          });
          setFeedback({ tone: "success", text: "Captured. Slowly turn your head a little for the next one." });
        } else {
          const reason = (result.reason ?? "no_face") as EnrollReason;
          setFeedback({ tone: "warning", text: ENROLL_MESSAGES[reason] });
          if (reason === "camera_unavailable" || reason === "unknown_person") setRunning(false);
        }
      } catch (err) {
        if (stopped) return;
        failures += 1;
        const message = err instanceof ApiError && err.status === 404 ? ENROLL_MESSAGES.unknown_person : (err as Error).message;
        setFeedback({ tone: "error", text: message });
        if (failures >= 3 || (err instanceof ApiError && err.status === 404)) {
          setRunning(false);
          return;
        }
      }
      if (!stopped) timer = setTimeout(step, CAPTURE_GAP_MS);
    };
    step();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, cameraMode, person.id, onCaptured]);

  const done = captured >= CAPTURE_TARGET;
  const pct = Math.min(100, Math.round((captured / CAPTURE_TARGET) * 100));

  return (
    <Card>
      <CardHeader
        title="Capture with the camera"
        description={
          cameraMode === "browser" ? "Uses this device's camera." : "Uses the camera connected to the Memory Assistant server."
        }
      />
      <CardBody className="space-y-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
          {cameraMode === "browser" ? (
            <video ref={videoRef} muted playsInline aria-label={`Camera preview for ${person.name}`} className="h-full w-full object-cover" />
          ) : (
            <img src="/video" alt={`Server camera preview for ${person.name}`} className="h-full w-full object-cover" />
          )}
          {cameraState !== "ready" && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              {cameraState === "error" ? <CameraOff className="h-10 w-10" aria-hidden="true" /> : <Camera className="h-10 w-10" aria-hidden="true" />}
            </div>
          )}
        </div>

        {cameraError && <Alert tone="error" title="Camera unavailable">{cameraError}</Alert>}

        <div>
          <div className="flex items-center justify-between text-sm">
            <span id="capture-progress-label" className="font-semibold text-ink">
              Progress
            </span>
            <span className="tabular-nums text-ink-muted">
              {Math.min(captured, CAPTURE_TARGET)} of {CAPTURE_TARGET} photos
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby="capture-progress-label"
            aria-valuemin={0}
            aria-valuemax={CAPTURE_TARGET}
            aria-valuenow={Math.min(captured, CAPTURE_TARGET)}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-sage-600 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div aria-live="polite">{feedback && !done && <Alert tone={feedback.tone}>{feedback.text}</Alert>}</div>

        {done ? (
          <Alert tone="info" title={`${CAPTURE_TARGET} photos captured`}>
            Continue to the next step to check that {person.name.split(" ")[0]} can be recognised.
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-3">
            {running ? (
              <Button variant="secondary" icon={<Pause className="h-4 w-4" aria-hidden="true" />} onClick={() => setRunning(false)}>
                Pause
              </Button>
            ) : (
              <Button
                icon={<Play className="h-4 w-4" aria-hidden="true" />}
                disabled={cameraState !== "ready"}
                onClick={() => {
                  setFeedback({ tone: "info", text: "Look at the camera. Photos are taken automatically." });
                  setRunning(true);
                }}
              >
                {captured ? "Continue capturing" : "Start capturing"}
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function UploadPhotos({ person, onUploaded }: { person: Person; onUploaded: (p: Person, results: PhotoResult[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PhotoResult[]>([]);

  async function upload() {
    setBusy(true);
    setError(null);
    try {
      const { name, relationship, notes, dob, tts_greeting } = person;
      const res = await api.updatePerson(person.id, { name, relationship, notes, dob, tts_greeting }, files);
      setResults(res.photos);
      setFiles([]);
      onUploaded(res.person, res.photos);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Or upload photos" description="Useful when the person isn't here right now." />
      <CardBody className="space-y-4">
        <PhotoPicker files={files} onChange={setFiles} />
        {error && <Alert tone="error">{error}</Alert>}
        <PhotoResults results={results} />
        <Button
          variant="secondary"
          icon={<Upload className="h-4 w-4" aria-hidden="true" />}
          disabled={!files.length}
          loading={busy}
          onClick={upload}
        >
          Upload {files.length || ""} photo{files.length === 1 ? "" : "s"}
        </Button>
      </CardBody>
    </Card>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────
export const STEPS = ["Who", "Photos", "Check", "Done"] as const;
/** Polling for the recognition engine to finish processing new photos. */
export const CHECK_INTERVAL_MS = 2000;
export const CHECK_ATTEMPTS = 10;
/** Live captures needed before the server refreshes its face gallery. */
export const MIN_CAPTURES = 10;

function WizardSteps({ step }: { step: number }) {
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Enrollment steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn("block h-1.5 rounded-full", current ? "bg-primary-600" : done ? "bg-sage-700" : "bg-line")}
            />
            <span className={cn("mt-2 flex items-center gap-1.5 text-sm", current ? "font-semibold text-ink" : "text-ink-muted")}>
              {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sage-700" aria-hidden="true" /> : <span aria-hidden="true">{n}.</span>}
              <span className="truncate">
                <span className="sr-only">
                  Step {n} of {STEPS.length}:{" "}
                </span>
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A step heading that receives focus when its step appears. */
function StepHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h2 ref={ref} tabIndex={-1} className="font-serif text-3xl text-ink outline-none">
      {children}
    </h2>
  );
}

// Step 1 — choose an existing person or add a new one.
function StepWho() {
  const navigate = useNavigate();
  const people = useAsync(() => api.people(), []);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addNew(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Please enter a name.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.createPerson({ name, relationship, notes: "", dob: "", tts_greeting: "" }, []);
      navigate(`/caregiver/enroll/${res.person.id}`);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Face enrollment" description="Teach the Memory Assistant to recognise someone, in four short steps." />
      <WizardSteps step={1} />
      <StepHeading>Who are you enrolling?</StepHeading>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="rounded-3xl">
          <CardHeader title="Someone already added" />
          {people.error ? (
            <CardBody>
              <ErrorState message={people.error.message} onRetry={people.reload} />
            </CardBody>
          ) : !people.data ? (
            <Spinner label="Loading people" />
          ) : !people.data.length ? (
            <EmptyState icon={<ScanFace className="h-6 w-6" aria-hidden="true" />} title="No one added yet" description="Add the first person on the right." />
          ) : (
            <ul className="divide-y divide-line">
              {people.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/caregiver/enroll/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-paper">
                    <Avatar name={p.name} src={p.photo_count || p.profile_photo_id ? api.personPhotoUrl(p.id, p.profile_photo_id) : null} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-sm text-ink-muted">{p.relationship || "Relationship not set"}</span>
                    </span>
                    <EnrollmentBadge person={p} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="rounded-3xl">
          <CardHeader title="Someone new" description="You can add more details later." />
          <CardBody>
            <form onSubmit={addNew} className="space-y-4" noValidate>
              <TextField
                label="Full name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                error={nameError}
                maxLength={120}
                autoComplete="off"
              />
              <TextField
                label="Relationship to the patient"
                placeholder="e.g. Daughter, Neighbour, Nurse"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                maxLength={120}
              />
              {saveError && <Alert tone="error">{saveError}</Alert>}
              <Button type="submit" loading={saving} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                Add and continue
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

type CheckState =
  | { status: "checking"; attempt: number }
  | { status: "confirmed"; person: Person }
  | { status: "unchanged"; person: Person } // was already enrolled; new photos added no usable samples
  | { status: "failed"; person: Person } // still no usable face samples
  | { status: "error"; message: string };

/**
 * Step 3 — ask the backend whether the new photos produced usable face
 * samples. Success is declared only when embedding_count goes up: the
 * server is the one that decides a person is recognisable.
 */
function useEnrollmentCheck(personId: string, baseline: number, nonce: number): CheckState {
  const [state, setState] = useState<CheckState>({ status: "checking", attempt: 0 });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    setState({ status: "checking", attempt: 0 });
    const tick = async () => {
      attempt += 1;
      try {
        const { person } = await api.person(personId);
        if (stopped) return;
        if (person.embedding_count > baseline) return setState({ status: "confirmed", person });
        if (attempt >= CHECK_ATTEMPTS) return setState({ status: baseline > 0 ? "unchanged" : "failed", person });
        setState({ status: "checking", attempt });
        timer = setTimeout(tick, CHECK_INTERVAL_MS);
      } catch (err) {
        if (!stopped) setState({ status: "error", message: (err as Error).message });
      }
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [personId, baseline, nonce]);
  return state;
}

function StepCheck({ person, baseline, onBack, onDone }: { person: Person; baseline: number; onBack: () => void; onDone: (p: Person) => void }) {
  const [nonce, setNonce] = useState(0);
  const check = useEnrollmentCheck(person.id, baseline, nonce);
  const first = person.name.split(" ")[0];
  useEffect(() => {
    if (check.status === "confirmed") onDone(check.person);
  }, [check, onDone]);

  return (
    <Card className="max-w-2xl rounded-3xl">
      <CardBody className="space-y-5">
        <StepHeading>Checking the photos</StepHeading>
        {check.status === "checking" && (
          <div role="status" className="flex items-center gap-3 text-lg text-ink">
            <Loader2 className="h-6 w-6 animate-spin text-sage-700" aria-hidden="true" />
            The recognition engine is processing {first}'s photos…
          </div>
        )}
        {check.status === "failed" && (
          <Alert tone="warning" title={`${first} can't be recognised yet`}>
            None of the photos produced a usable face. Try again in good, even light, with only {first} in view, looking at the camera.
          </Alert>
        )}
        {check.status === "unchanged" && (
          <Alert tone="info" title={`${first} is already enrolled`}>
            {first} can be recognised from earlier photos, but the new ones didn't add usable face samples. You can try again or finish.
          </Alert>
        )}
        {check.status === "error" && (
          <Alert tone="error" title="Couldn't reach the recognition engine">
            {check.message}
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
            Back to photos
          </Button>
          {check.status === "error" && <Button onClick={() => setNonce((n) => n + 1)}>Check again</Button>}
          {check.status === "unchanged" && <ButtonLink to={`/caregiver/people/${person.id}`}>Finish</ButtonLink>}
        </div>
      </CardBody>
    </Card>
  );
}

function StepDone({ person, baseline }: { person: Person; baseline: number }) {
  const first = person.name.split(" ")[0];
  const added = person.embedding_count - baseline;
  return (
    <Card className="max-w-2xl rounded-3xl">
      <CardBody className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar name={person.name} src={api.personPhotoUrl(person.id, person.profile_photo_id)} size="xl" />
        <div className="space-y-3">
          <StepHeading>{first} can now be recognised</StepHeading>
          <p className="text-lg text-ink-muted">
            The recognition engine confirmed {added} new usable face sample{added === 1 ? "" : "s"} ({person.embedding_count} in total).
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <ButtonLink to={`/caregiver/people/${person.id}`}>View {first}'s profile</ButtonLink>
            <ButtonLink to="/caregiver/enroll" variant="secondary">
              Enroll someone else
            </ButtonLink>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

const TIPS = [
  "Only the person being enrolled should be in view.",
  "Face a window or lamp — avoid strong light behind them.",
  "Sit about an arm's length from the camera.",
  "Look straight ahead first, then slowly turn a little left and right.",
];

/** FaceEnrollmentWizard: Who → Photos → Check → Done. */
export function EnrollmentPage() {
  const { id } = useParams();
  if (!id) return <StepWho />;
  return <EnrollPerson key={id} id={id} />;
}

function EnrollPerson({ id }: { id: string }) {
  const detail = useAsync(() => api.person(id), [id]);
  const status = useAsync(() => api.status(), []);
  const [phase, setPhase] = useState<"photos" | "check" | "done">("photos");
  const [captured, setCaptured] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [confirmed, setConfirmed] = useState<Person | null>(null);
  // Usable samples before this session — success means the server reports more.
  const baseline = useRef<number | null>(null);
  if (detail.data && baseline.current === null) baseline.current = detail.data.person.embedding_count;

  const onCaptured = useCallback((n: number) => setCaptured(n), []);
  const onDone = useCallback((p: Person) => {
    setConfirmed(p);
    setPhase("done");
  }, []);

  if (detail.error) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        <PageHeader title="Face enrollment" />
        {missing ? <Alert tone="warning">This person no longer exists.</Alert> : <ErrorState message={detail.error.message} onRetry={detail.reload} />}
      </>
    );
  }
  if (!detail.data || !status.data) {
    return status.error ? <ErrorState message={status.error.message} onRetry={status.reload} /> : <Spinner label="Loading" />;
  }

  const person = detail.data.person;
  const first = person.name.split(" ")[0];
  const ready = captured >= MIN_CAPTURES || uploaded > 0;
  const step = phase === "photos" ? 2 : phase === "check" ? 3 : 4;

  return (
    <>
      <ButtonLink to="/caregiver/enroll" variant="ghost" size="sm" className="-ml-3 mb-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
        Choose someone else
      </ButtonLink>
      <PageHeader
        title={`Enroll ${person.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <EnrollmentBadge person={person} />
            <span>
              {person.photo_count} photo{person.photo_count === 1 ? "" : "s"} saved · {person.embedding_count} usable
            </span>
          </span>
        }
      />
      <WizardSteps step={step} />

      {phase === "photos" && (
        <>
          <StepHeading>Add photos of {first}</StepHeading>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] text-ink-muted sm:grid-cols-2">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-700" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <LiveCapture person={person} cameraMode={status.data.camera_mode} onCaptured={onCaptured} />
            <UploadPhotos person={person} onUploaded={(_p, results) => setUploaded((n) => n + results.filter((r) => r.status === "accepted").length)} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-card p-5">
            <Button disabled={!ready} onClick={() => setPhase("check")} icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              Check enrollment
            </Button>
            <p className="text-[15px] text-ink-muted" role="status">
              {ready
                ? `${captured} captured · ${uploaded} uploaded. Ready to check.`
                : captured > 0
                  ? `${captured} of at least ${MIN_CAPTURES} captures — keep going, or upload photos instead.`
                  : `Capture at least ${MIN_CAPTURES} photos with the camera, or upload one or more.`}
            </p>
          </div>
        </>
      )}

      {phase === "check" && <StepCheck person={person} baseline={baseline.current ?? 0} onBack={() => setPhase("photos")} onDone={onDone} />}
      {phase === "done" && confirmed && <StepDone person={confirmed} baseline={baseline.current ?? 0} />}
    </>
  );
}
