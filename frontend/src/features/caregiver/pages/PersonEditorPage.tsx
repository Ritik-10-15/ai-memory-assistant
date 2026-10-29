import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ScanFace, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import type { PersonInput, PhotoResult } from "@/api/types";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Spinner,
  TextAreaField,
  TextField,
} from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, formatDuration } from "@/lib/format";
import { EnrollmentBadge, PageHeader, PhotoPicker, PhotoResults } from "../components";
import { ProfilePhotoPicker } from "../ProfilePhotoPicker";
import { MemoryComposer, MemoryList } from "./MemoriesPage";

const EMPTY: PersonInput = { name: "", relationship: "", notes: "", dob: "", tts_greeting: "" };

export function PersonEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useAsync(() => (id ? api.person(id) : Promise.resolve(null)), [id]);

  const [form, setForm] = useState<PersonInput>(EMPTY);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Photo results survive the redirect from "add" to "edit".
  const [photoResults, setPhotoResults] = useState<PhotoResult[]>(
    (location.state as { photos?: PhotoResult[] } | null)?.photos ?? [],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const p = detail.data?.person;
    if (p) setForm({ name: p.name, relationship: p.relationship, notes: p.notes, dob: p.dob, tts_greeting: p.tts_greeting });
  }, [detail.data]);

  const set = (key: keyof PersonInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
    if (key === "name") setNameError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError("Please enter a name.");
      document.getElementById("person-name")?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = isNew ? await api.createPerson(form, photos) : await api.updatePerson(id!, form, photos);
      setPhotos([]);
      if (isNew) {
        navigate(`/caregiver/people/${result.person.id}/edit`, { replace: true, state: { photos: result.photos } });
        return;
      }
      setPhotoResults(result.photos);
      setSaved(true);
      detail.setData((prev) => (prev ? { ...prev, person: result.person } : prev));
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePerson(id!);
      navigate("/caregiver/people", { replace: true });
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleting(false);
    }
  }

  if (!isNew && detail.loading && !detail.data) return <Spinner label="Loading profile" />;
  if (!isNew && detail.error) {
    return (
      <>
        <PageHeader title="Person" />
        <ErrorState message={detail.error.message} onRetry={detail.reload} />
      </>
    );
  }

  const person = detail.data?.person;
  const title = isNew ? "Add a person" : person?.name ?? "Edit person";

  return (
    <>
      <ButtonLink to="/caregiver/people" variant="ghost" size="sm" className="-ml-3 mb-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
        All people
      </ButtonLink>
      <PageHeader
        title={title}
        description={isNew ? "Their details appear on the patient screen when they are recognised." : undefined}
        actions={
          person && (
            <ButtonLink to={`/caregiver/enroll/${person.id}`} variant="secondary" icon={<ScanFace className="h-4 w-4" aria-hidden="true" />}>
              Enroll with camera
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              {person && (
                <div className="flex items-center gap-4">
                  <Avatar
                    name={person.name}
                    src={person.photo_count || person.profile_photo_id ? api.personPhotoUrl(person.id, person.profile_photo_id) : null}
                    size="lg"
                  />
                  <div className="space-y-1">
                    <EnrollmentBadge person={person} />
                    <p className="text-sm text-ink-muted">
                      {person.photo_count} photo{person.photo_count === 1 ? "" : "s"} · {person.embedding_count} usable for recognition
                    </p>
                  </div>
                </div>
              )}
              <TextField id="person-name" label="Full name" required value={form.name} onChange={set("name")} error={nameError} maxLength={120} autoComplete="off" />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Relationship to the patient" placeholder="e.g. Daughter, Neighbour, Nurse" value={form.relationship} onChange={set("relationship")} maxLength={120} />
                <TextField label="Date of birth" type="date" value={form.dob} onChange={set("dob")} />
              </div>
              <TextAreaField label="About this person" hint="Shown to the patient under their name." value={form.notes} onChange={set("notes")} maxLength={4000} />
              <TextField
                label="Spoken greeting"
                hint="Spoken by the server's speaker when they're recognised, if text-to-speech is installed there."
                placeholder="e.g. Hello! Your daughter Sarah is here."
                value={form.tts_greeting}
                onChange={set("tts_greeting")}
                maxLength={300}
              />
              <PhotoPicker files={photos} onChange={setPhotos} />
              {saveError && <Alert tone="error">{saveError}</Alert>}
              {saved && <Alert tone="success">Changes saved.</Alert>}
              <PhotoResults results={photoResults} />
              <div className="flex flex-wrap gap-3 pt-1">
                <Button type="submit" loading={saving}>
                  {isNew ? "Add person" : "Save changes"}
                </Button>
                {isNew && (
                  <ButtonLink to="/caregiver/people" variant="secondary">
                    Cancel
                  </ButtonLink>
                )}
              </div>
            </form>
          </CardBody>
        </Card>

        {person && detail.data && (
          <div className="space-y-6">
            <ProfilePhotoPicker
              person={person}
              onChanged={(photoId) =>
                detail.setData((prev) => (prev ? { ...prev, person: { ...prev.person, profile_photo_id: photoId } } : prev))
              }
            />
            <Card>
              <CardHeader title="Memories" description={`Conversations shown to the patient when ${person.name.split(" ")[0]} visits.`} />
              <CardBody className="space-y-5">
                <MemoryComposer
                  personId={person.id}
                  onAdded={(m) => detail.setData((prev) => (prev ? { ...prev, memories: [m, ...prev.memories] } : prev))}
                />
                <MemoryList
                  memories={detail.data.memories}
                  showPerson={false}
                  onDeleted={(mid) =>
                    detail.setData((prev) => (prev ? { ...prev, memories: prev.memories.filter((m) => m.id !== mid) } : prev))
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recent visits" />
              <CardBody className="py-2">
                {detail.data.visits.length ? (
                  <ul className="divide-y divide-line">
                    {detail.data.visits.slice(0, 8).map((v) => (
                      <li key={v.id} className="flex justify-between gap-3 py-2.5 text-[15px]">
                        <span className="text-ink">{formatDateTime(v.started_at)}</span>
                        <span className="text-ink-muted">{formatDuration(v.duration_s)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-[15px] text-ink-muted">No visits recorded yet.</p>
                )}
              </CardBody>
            </Card>

            <Card className="border-danger-100">
              <CardHeader title="Delete this person" description="Removes their profile, face photos, memories and visit history." />
              <CardBody>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} onClick={() => setConfirmDelete(true)}>
                  Delete {person.name}
                </Button>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${person?.name ?? ""}?`}
        description="This permanently removes their profile, face photos, memories and visit records. This can't be undone."
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
