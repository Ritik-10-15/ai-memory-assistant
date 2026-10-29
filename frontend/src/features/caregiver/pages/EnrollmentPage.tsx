import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, Pause, Play, ScanFace, Upload } from "lucide-react";
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
} from "@/components/ui";
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

function PersonPicker() {
  const people = useAsync(() => api.people(), []);
  return (
    <>
      <PageHeader title="Face enrollment" description="Choose who to enroll. A dozen clear captures from different angles works well." />
      {people.error ? (
        <ErrorState message={people.error.message} onRetry={people.reload} />
      ) : !people.data ? (
        <Spinner label="Loading people" />
      ) : !people.data.length ? (
        <Card>
          <EmptyState
            icon={<ScanFace className="h-6 w-6" aria-hidden="true" />}
            title="No one to enroll yet"
            description="Add a person first."
            action={<ButtonLink to="/caregiver/people/add">Add person</ButtonLink>}
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {people.data.map((p) => (
              <li key={p.id}>
                <Link to={`/caregiver/enroll/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-paper">
                  <Avatar name={p.name} src={p.photo_count || p.profile_photo_id ? api.personPhotoUrl(p.id, p.profile_photo_id) : null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{p.name}</p>
                    <p className="truncate text-sm text-ink-muted">{p.relationship || "Relationship not set"}</p>
                  </div>
                  <EnrollmentBadge person={p} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

type Feedback = { tone: "info" | "success" | "warning" | "error"; text: string };

function LiveCapture({ person, cameraMode, onCaptured }: { person: Person; cameraMode: "browser" | "server"; onCaptured: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">(cameraMode === "server" ? "ready" : "starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
          onCaptured();
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
          <Alert tone="success" title="Enrollment complete">
            {person.name.split(" ")[0]} will be recognisable within a few seconds, once the new photos are processed.
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

function UploadPhotos({ person, onUploaded }: { person: Person; onUploaded: (p: Person) => void }) {
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
      onUploaded(res.person);
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

export function EnrollmentPage() {
  const { id } = useParams();
  const detail = useAsync(() => (id ? api.person(id) : Promise.resolve(null)), [id]);
  const status = useAsync(() => api.status(), []);

  // Refresh the enrollment badge a moment after captures (gallery reload is async).
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const { reload } = detail;
  const onCaptured = useRef(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(reload, 4000);
  }).current;
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  if (!id) return <PersonPicker />;
  if (detail.error) {
    return (
      <>
        <PageHeader title="Face enrollment" />
        <ErrorState message={detail.error.message} onRetry={detail.reload} />
      </>
    );
  }
  if (!detail.data || !status.data) {
    return status.error ? <ErrorState message={status.error.message} onRetry={status.reload} /> : <Spinner label="Loading" />;
  }

  const person = detail.data.person;
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <LiveCapture person={person} cameraMode={status.data.camera_mode} onCaptured={onCaptured} />
        <div className="space-y-6">
          <Card>
            <CardHeader title="For the best results" />
            <CardBody>
              <ul className="space-y-2.5 text-[15px] text-ink">
                {[
                  "Only the person being enrolled should be in view.",
                  "Face a window or lamp — avoid strong light behind them.",
                  "Sit about an arm's length from the camera.",
                  "Look straight ahead first, then slowly turn a little left and right.",
                  "Try a neutral face, a smile, and talking.",
                ].map((tip) => (
                  <li key={tip} className="flex gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage-600" aria-hidden="true" />
                    {tip}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <UploadPhotos
            person={person}
            onUploaded={(p) => {
              detail.setData((prev) => (prev ? { ...prev, person: p } : prev));
              onCaptured();
            }}
          />
        </div>
      </div>
    </>
  );
}
