import { useEffect, useMemo, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { EnrollReason, Person, PhotoResult, PhotoStatus } from "@/api/types";
import { Badge, Card } from "@/components/ui";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  // Each page announces itself: the document title follows the page.
  useEffect(() => {
    document.title = `${title} · Memory Assistant`;
  }, [title]);
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-[2.6rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="rounded-3xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon && (
          <span className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-sage-50 text-sage-700 sm:flex">{icon}</span>
        )}
      </div>
      <p className="mt-2 font-serif text-3xl tabular-nums text-ink sm:text-4xl">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </Card>
  );
}

export type EnrollmentStatus = "enrolled" | "pending" | "none";

/**
 * Photos are embedded by a background gallery reload, so "has photos but no
 * embeddings yet" is either still processing or the photos had no usable face.
 */
export function enrollmentStatus(p: Pick<Person, "photo_count" | "embedding_count">): EnrollmentStatus {
  if (p.embedding_count > 0) return "enrolled";
  if (p.photo_count > 0) return "pending";
  return "none";
}

export function EnrollmentBadge({ person }: { person: Pick<Person, "photo_count" | "embedding_count"> }) {
  const status = enrollmentStatus(person);
  if (status === "enrolled")
    return (
      <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}>
        Face enrolled
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge tone="warning" icon={<CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />}>
        Not recognisable yet
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={<CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />}>
      No face photos
    </Badge>
  );
}

export const PHOTO_MESSAGES: Record<PhotoStatus, string> = {
  accepted: "Added",
  no_face: "No face found — use a clear, well-lit photo of their face.",
  multiple_faces: "More than one face — use a photo of this person alone.",
  invalid_image: "Not a readable image (use JPG or PNG).",
};

export const ENROLL_MESSAGES: Record<EnrollReason, string> = {
  no_face: "No face found. Face the camera in good light.",
  multiple_faces: "More than one face is in view. Only the person being enrolled should be in the frame.",
  invalid_image: "The camera image couldn't be read. Please try again.",
  camera_unavailable: "The camera on the server isn't available.",
  unknown_person: "This person no longer exists.",
};

export function PhotoResults({ results }: { results: PhotoResult[] }) {
  if (!results.length) return null;
  const rejected = results.filter((r) => r.status !== "accepted");
  return (
    <div role="status" className="space-y-2">
      <p className="text-sm font-semibold text-ink">
        {results.length - rejected.length} of {results.length} photo{results.length === 1 ? "" : "s"} added
      </p>
      {rejected.length > 0 && (
        <ul className="space-y-1 text-sm">
          {rejected.map((r, i) => (
            <li key={`${r.filename}-${i}`} className="text-caution-700">
              <span className="font-medium">{r.filename}:</span> {PHOTO_MESSAGES[r.status]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Multi-file image picker with thumbnail previews (object URLs are revoked). */
export function PhotoPicker({
  files,
  onChange,
  label = "Face photos",
  hint = "A few clear photos of this person alone, facing the camera. Each photo is checked for exactly one face.",
  id = "photo-input",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  hint?: string;
  id?: string;
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-muted">
          {hint}
        </p>
      </div>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])]);
          e.target.value = "";
        }}
        className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:py-2 file:font-semibold file:text-ink hover:file:bg-primary-50"
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Selected photos">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative">
              <img src={urls[i]} alt={f.name} className="h-20 w-20 rounded-xl border border-line object-cover" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-sm font-bold text-ink-muted shadow-card hover:text-danger-700"
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function sourceLabel(source: string): string {
  if (source === "whisper") return "Voice memo";
  if (source === "manual") return "Written note";
  return source;
}
