import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, ScanFace, Search, Trash2, Users } from "lucide-react";
import { api } from "@/api/client";
import type { Person } from "@/api/types";
import { Avatar, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatShortDate } from "@/lib/format";
import { EnrollmentBadge, PageHeader } from "../components";

export function matchesQuery(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.relationship, p.notes].some((v) => v?.toLowerCase().includes(q));
}

function PersonCard({ person, onDelete }: { person: Person; onDelete: () => void }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-4 p-5">
        <Avatar name={person.name} src={person.photo_count || person.profile_photo_id ? api.personPhotoUrl(person.id, person.profile_photo_id) : null} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-ink">
            <Link to={`/caregiver/people/${person.id}/edit`} className="hover:underline">
              {person.name}
            </Link>
          </h2>
          <p className="truncate text-[15px] text-ink-muted">{person.relationship || "Relationship not set"}</p>
          <div className="mt-2">
            <EnrollmentBadge person={person} />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 border-y border-line text-center">
        {[
          ["Visits", person.visit_count],
          ["Memories", person.memory_count],
          ["Last visit", person.last_visit_at ? formatShortDate(person.last_visit_at) : "—"],
        ].map(([label, value]) => (
          <div key={label as string} className="px-2 py-3">
            <dt className="text-xs font-medium text-ink-muted">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 p-4">
        <ButtonLink
          to={`/caregiver/people/${person.id}/edit`}
          variant="secondary"
          size="sm"
          icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
        >
          Edit<span className="sr-only"> {person.name}</span>
        </ButtonLink>
        <ButtonLink
          to={`/caregiver/enroll/${person.id}`}
          variant="secondary"
          size="sm"
          icon={<ScanFace className="h-4 w-4" aria-hidden="true" />}
        >
          Enroll face<span className="sr-only"> for {person.name}</span>
        </ButtonLink>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-danger-700 hover:bg-danger-50"
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          onClick={onDelete}
        >
          Delete<span className="sr-only"> {person.name}</span>
        </Button>
      </div>
    </Card>
  );
}

export function PeoplePage() {
  const people = useAsync(() => api.people(), []);
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => (people.data ?? []).filter((p) => matchesQuery(p, query)), [people.data, query]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePerson(toDelete.id);
      people.setData((prev) => (prev ?? []).filter((p) => p.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Registered people"
        description="Everyone the Memory Assistant can recognise, and their enrollment status."
        actions={
          <ButtonLink to="/caregiver/people/add" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Add person
          </ButtonLink>
        }
      />

      <div className="relative mb-6 max-w-md">
        <label htmlFor="people-search" className="sr-only">
          Search people
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          id="people-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, relationship or notes"
          className="block w-full rounded-xl border border-line bg-card py-2.5 pl-11 pr-3.5 text-[15px] placeholder:text-ink-muted"
        />
      </div>

      {people.error ? (
        <ErrorState message={people.error.message} onRetry={people.reload} />
      ) : people.loading && !people.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : !people.data?.length ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title="No one registered yet"
            description="Add family, friends and carers, then enroll their faces so they can be recognised."
            action={
              <ButtonLink to="/caregiver/people/add" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Add the first person
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <p role="status" className="mb-3 text-sm text-ink-muted">
            {query ? `${filtered.length} of ${people.data.length} people match “${query}”` : `${people.data.length} people`}
          </p>
          {filtered.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <li key={p.id}>
                  <PersonCard person={p} onDelete={() => setToDelete(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <EmptyState title="No matches" description="Try a different name or relationship." />
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete ${toDelete?.name ?? ""}?`}
        description={
          <>
            This permanently removes their profile, face photos, {toDelete?.memory_count ?? 0} saved memories and{" "}
            {toDelete?.visit_count ?? 0} visit records. This can't be undone.
          </>
        }
        confirmLabel="Delete permanently"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setToDelete(null);
          setDeleteError(null);
        }}
      />
    </>
  );
}
