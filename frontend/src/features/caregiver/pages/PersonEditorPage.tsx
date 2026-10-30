import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ScanFace } from "lucide-react";
import { api } from "@/api/client";
import type { PersonInput } from "@/api/types";
import { Alert, Avatar, Button, ButtonLink, Card, CardBody, CardHeader, ErrorState, Spinner, TextAreaField, TextField } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { EnrollmentBadge, PageHeader, PhotoPicker } from "../components";

const EMPTY: PersonInput = { name: "", relationship: "", notes: "", dob: "", tts_greeting: "" };

/**
 * PersonForm: add a person, or edit their details. After saving, the
 * profile page shows the outcome (including any photos that were rejected).
 */
export function PersonEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const detail = useAsync(() => (id ? api.person(id) : Promise.resolve(null)), [id]);

  const [form, setForm] = useState<PersonInput>(EMPTY);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const p = detail.data?.person;
    if (p) setForm({ name: p.name, relationship: p.relationship, notes: p.notes, dob: p.dob, tts_greeting: p.tts_greeting });
  }, [detail.data]);

  const set = (key: keyof PersonInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
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
      navigate(`/caregiver/people/${result.person.id}`, {
        replace: isNew,
        state: { photos: result.photos, saved: isNew ? "added" : "saved" },
      });
    } catch (err) {
      setSaveError((err as Error).message);
      setSaving(false);
    }
  }

  if (!isNew && detail.loading && !detail.data) return <Spinner label="Loading profile" />;
  if (!isNew && detail.error) {
    return (
      <>
        <PageHeader title="Edit person" />
        <ErrorState message={detail.error.message} onRetry={detail.reload} />
      </>
    );
  }

  const person = detail.data?.person;
  const back = isNew ? "/caregiver/people" : `/caregiver/people/${id}`;

  return (
    <>
      <ButtonLink to={back} variant="ghost" size="sm" className="-ml-3 mb-2" icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
        {isNew ? "All loved ones" : `Back to ${person?.name ?? "profile"}`}
      </ButtonLink>
      <PageHeader
        title={isNew ? "Add a person" : `Edit ${person?.name ?? "person"}`}
        description={isNew ? "Their details appear on the patient screen when they are recognised." : undefined}
        actions={
          person && (
            <ButtonLink to={`/caregiver/enroll/${person.id}`} variant="secondary" icon={<ScanFace className="h-4 w-4" aria-hidden="true" />}>
              Enroll with camera
            </ButtonLink>
          )
        }
      />

      <Card className="max-w-3xl rounded-3xl">
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
            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" loading={saving}>
                {isNew ? "Add person" : "Save changes"}
              </Button>
              <ButtonLink to={back} variant="secondary">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
