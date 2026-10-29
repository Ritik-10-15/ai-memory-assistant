import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { api } from "@/api/client";
import type { Person } from "@/api/types";
import { Alert, Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { cn } from "@/lib/cn";

/**
 * Choose which picture represents a person on the patient screen and in
 * the family album: one of the family photos they're tagged in, or the
 * default (their first face-enrollment photo).
 */
export function ProfilePhotoPicker({ person, onChanged }: { person: Person; onChanged: (photoId: string | null) => void }) {
  const photos = useAsync(() => api.photos(person.id), [person.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = person.name.split(" ")[0];

  async function choose(photoId: string | null) {
    setBusy(photoId ?? "default");
    setError(null);
    try {
      await api.setProfilePhoto(person.id, photoId);
      onChanged(photoId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const tile = (selected: boolean) =>
    cn(
      "relative block overflow-hidden rounded-xl border-2 text-left transition-colors disabled:opacity-60",
      selected ? "border-primary-700" : "border-transparent hover:border-line-strong",
    );

  return (
    <Card>
      <CardHeader title="Profile picture" description={`Shown to the patient when ${first} visits and in the family album.`} />
      <CardBody className="space-y-3">
        {photos.loading && !photos.data ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <li>
              <button
                type="button"
                aria-pressed={!person.profile_photo_id}
                disabled={busy !== null}
                onClick={() => choose(null)}
                className={tile(!person.profile_photo_id)}
              >
                <div className="flex aspect-square items-center justify-center bg-paper p-2 text-center text-sm font-semibold text-ink">
                  Enrollment photo
                </div>
                {!person.profile_photo_id && <SelectedMark />}
              </button>
            </li>
            {(photos.data ?? []).map((p) => {
              const selected = person.profile_photo_id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={busy !== null}
                    onClick={() => choose(p.id)}
                    className={tile(selected)}
                  >
                    <img src={api.photoUrl(p.id)} alt={p.caption || "Family photo"} className="aspect-square w-full object-cover" />
                    {selected && <SelectedMark />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!photos.loading && !photos.data?.length && (
          <p className="text-sm text-ink-muted">
            Tag {first} in a{" "}
            <Link to="/caregiver/photos" className="font-semibold text-primary-700 underline underline-offset-2">
              family photo
            </Link>{" "}
            to use it as their picture.
          </p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </CardBody>
    </Card>
  );
}

function SelectedMark() {
  return (
    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-white">
      <Check className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Current picture</span>
    </span>
  );
}
