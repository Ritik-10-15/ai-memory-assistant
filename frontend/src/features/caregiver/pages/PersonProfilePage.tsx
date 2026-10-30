import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Cake, Pencil, ScanFace, Trash2 } from "lucide-react";
import { api, ApiError } from "@/api/client";
import type { PhotoResult } from "@/api/types";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { PersonPhoto } from "@/features/patient/album/pieces";
import { EnrollmentBadge, PageHeader, PhotoResults } from "../components";
import { MemoryTimeline } from "../MemoryCard";
import { ProfilePhotoPicker } from "../ProfilePhotoPicker";
import { MemoryComposer } from "./MemoriesPage";

/**
 * PersonProfile: everything about one loved one in one place — details,
 * enrollment, memories (add / edit / delete / listen), visits, profile
 * picture — with edit and delete actions.
 */
export function PersonProfilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useAsync(() => api.person(id), [id]);
  const flash = location.state as { photos?: PhotoResult[]; saved?: "added" | "saved" } | null;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePerson(id);
      navigate("/caregiver/people", { replace: true });
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleting(false);
    }
  }

  const back = (
    <ButtonLink to="/caregiver/people" variant="ghost" size="sm" className="-ml-3 mb-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
      All loved ones
    </ButtonLink>
  );

  if (detail.error) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        {back}
        <PageHeader title={missing ? "Person not found" : "Profile"} />
        {missing ? (
          <Alert tone="warning">This person may have been deleted.</Alert>
        ) : (
          <ErrorState message={detail.error.message} onRetry={detail.reload} />
        )}
      </>
    );
  }
  if (!detail.data) {
    return (
      <div aria-busy="true">
        {back}
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    );
  }

  const { person, memories, visits } = detail.data;
  const first = person.name.split(" ")[0];

  return (
    <>
      {back}
      {flash?.saved && (
        <div className="mb-6 space-y-3">
          <Alert tone="success">{flash.saved === "added" ? `${person.name} has been added.` : "Changes saved."}</Alert>
          {flash.photos && <PhotoResults results={flash.photos} />}
        </div>
      )}

      <section className="mb-8 grid gap-6 rounded-3xl border border-line bg-card p-5 shadow-card sm:p-7 md:grid-cols-[15rem_minmax(0,1fr)] md:items-center">
        <PersonPhoto id={person.id} name={person.name} className="mx-auto w-full max-w-[15rem] shadow-none" />
        <div className="min-w-0">
          <PageHeader
            title={person.name}
            description={<span className="text-lg font-medium text-sage-700">{person.relationship || "Relationship not set"}</span>}
          />
          <div className="-mt-4 space-y-3">
            {person.notes && <p className="max-w-2xl text-[17px] leading-relaxed text-ink">{person.notes}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-ink-muted">
              <EnrollmentBadge person={person} />
              <span>
                {person.photo_count} face photo{person.photo_count === 1 ? "" : "s"} · {person.embedding_count} usable
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {person.last_visit_at ? `Last visit ${formatDateTime(person.last_visit_at)}` : "No visits yet"}
              </span>
              {person.dob && (
                <span className="inline-flex items-center gap-1.5">
                  <Cake className="h-4 w-4" aria-hidden="true" />
                  Born {formatDate(`${person.dob} 00:00:00`)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <ButtonLink to={`/caregiver/people/${person.id}/edit`} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
                Edit details
              </ButtonLink>
              <ButtonLink to={`/caregiver/enroll/${person.id}`} variant="secondary" icon={<ScanFace className="h-4 w-4" aria-hidden="true" />}>
                Enroll face
              </ButtonLink>
              <Button
                variant="ghost"
                className="text-danger-700 hover:bg-danger-50"
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-labelledby="memories-heading" className="space-y-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="memories-heading" className="font-serif text-3xl text-ink">
              Memories
            </h2>
            <span className="text-sm text-ink-muted">
              {memories.length} saved · shown to the patient when {first} visits
            </span>
          </div>
          <Card className="rounded-3xl">
            <CardBody>
              <MemoryComposer
                personId={person.id}
                onAdded={(m) => detail.setData((prev) => (prev ? { ...prev, memories: [m, ...prev.memories] } : prev))}
              />
            </CardBody>
          </Card>
          <MemoryTimeline
            memories={memories}
            showPerson={false}
            onUpdated={(m) => detail.setData((prev) => (prev ? { ...prev, memories: prev.memories.map((x) => (x.id === m.id ? m : x)) } : prev))}
            onDeleted={(mid) => detail.setData((prev) => (prev ? { ...prev, memories: prev.memories.filter((m) => m.id !== mid) } : prev))}
          />
        </section>

        <div className="space-y-6">
          <ProfilePhotoPicker
            person={person}
            onChanged={(photoId) => detail.setData((prev) => (prev ? { ...prev, person: { ...prev.person, profile_photo_id: photoId } } : prev))}
          />
          <Card className="rounded-3xl">
            <CardHeader title="Visit history" description={`${person.visit_count} recorded visit${person.visit_count === 1 ? "" : "s"}`} />
            <CardBody className="py-2">
              {visits.length ? (
                <ol className="divide-y divide-line">
                  {visits.slice(0, 10).map((v) => (
                    <li key={v.id} className="flex justify-between gap-3 py-3 text-[15px]">
                      <span className="text-ink">{formatDateTime(v.started_at)}</span>
                      <span className="text-ink-muted">{v.ended_at ? formatDuration(v.duration_s) : "In progress"}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-3 text-[15px] text-ink-muted">No visits recorded yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${person.name}?`}
        description={`This permanently removes their profile, face photos, ${memories.length} saved memories and ${person.visit_count} visit records. This can't be undone.`}
        confirmLabel="Delete permanently"
        busy={deleting}
        error={deleteError}
        onConfirm={onDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
      />
    </>
  );
}
