import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, MessageSquareText, Pencil, Plus, ScanFace, Search, Trash2, Users } from "lucide-react";
import { api } from "@/api/client";
import type { Person } from "@/api/types";
import { Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { cn } from "@/lib/cn";
import { formatShortDate, parseServerTime } from "@/lib/format";
import { PersonPhoto } from "@/features/patient/album/pieces";
import { EnrollmentBadge, enrollmentStatus, PageHeader, type EnrollmentStatus } from "../components";

export function matchesQuery(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.relationship, p.notes].some((v) => v?.toLowerCase().includes(q));
}

export type StatusFilter = "all" | EnrollmentStatus;
export type SortKey = "name" | "recent" | "memories";

/** Search, enrollment filter and sort — pure, so it's easy to test. */
export function directoryView(people: Person[], query: string, status: StatusFilter, sort: SortKey): Person[] {
  const time = (p: Person) => parseServerTime(p.last_visit_at)?.getTime() ?? 0;
  const out = people.filter((p) => matchesQuery(p, query) && (status === "all" || enrollmentStatus(p) === status));
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return out.sort((a, b) =>
    sort === "recent" ? time(b) - time(a) || byName(a, b) : sort === "memories" ? b.memory_count - a.memory_count || byName(a, b) : byName(a, b),
  );
}

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "enrolled", label: "Face enrolled" },
  { id: "pending", label: "Not recognisable yet" },
  { id: "none", label: "No face photos" },
];

function PersonCard({ person, onDelete }: { person: Person; onDelete: () => void }) {
  const profile = `/caregiver/people/${person.id}`;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <Link to={profile} className="group block p-3 pb-0" aria-label={`Open ${person.name}'s profile`}>
        <PersonPhoto id={person.id} name={person.name} aspect="aspect-[4/3]" className="shadow-none ring-0" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-serif text-2xl leading-tight text-ink">
          <Link to={profile} className="hover:underline hover:decoration-2 hover:underline-offset-4">
            {person.name}
          </Link>
        </h2>
        <p className="mt-0.5 text-[15px] font-medium text-sage-700">{person.relationship || "Relationship not set"}</p>
        {person.notes && <p className="mt-2 line-clamp-2 text-[15px] text-ink-muted">{person.notes}</p>}
        <div className="mt-3">
          <EnrollmentBadge person={person} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Last visit</dt>
            <CalendarClock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            <dd className="text-ink">{person.last_visit_at ? formatShortDate(person.last_visit_at) : "No visits yet"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Memories</dt>
            <MessageSquareText className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            <dd className="text-ink">
              {person.memory_count} {person.memory_count === 1 ? "memory" : "memories"}
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <ButtonLink to={`/caregiver/people/${person.id}/edit`} variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
            Edit<span className="sr-only"> {person.name}</span>
          </ButtonLink>
          <ButtonLink to={`/caregiver/enroll/${person.id}`} variant="secondary" size="sm" icon={<ScanFace className="h-4 w-4" aria-hidden="true" />}>
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
      </div>
    </article>
  );
}

export function PeoplePage() {
  const people = useAsync(() => api.people(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [toDelete, setToDelete] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shown = useMemo(() => directoryView(people.data ?? [], query, status, sort), [people.data, query, status, sort]);

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

  const field = "block w-full rounded-2xl border border-line-strong bg-card text-[15px] text-ink";

  return (
    <>
      <PageHeader
        title="Loved ones"
        description="The people the Memory Assistant can recognise, with their memories and visits."
        actions={
          <ButtonLink to="/caregiver/people/add" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Add person
          </ButtonLink>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="relative min-w-[16rem] flex-1">
          <label htmlFor="people-search" className="mb-1.5 block text-sm font-semibold text-ink">
            Search
          </label>
          <Search className="pointer-events-none absolute bottom-3 left-3.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
          <input
            id="people-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, relationship or notes"
            className={cn(field, "py-2.5 pl-11 pr-3.5 placeholder:text-ink-muted")}
          />
        </div>
        <div className="w-full sm:w-52">
          <label htmlFor="people-sort" className="mb-1.5 block text-sm font-semibold text-ink">
            Sort by
          </label>
          <select id="people-sort" className={cn(field, "px-3.5 py-2.5")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">Name (A–Z)</option>
            <option value="recent">Most recent visit</option>
            <option value="memories">Most memories</option>
          </select>
        </div>
      </div>
      <div role="group" aria-label="Filter by enrollment" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={status === f.id}
            onClick={() => setStatus(f.id)}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors",
              status === f.id ? "border-sage-700 bg-sage-700 text-white" : "border-line-strong bg-card text-ink hover:bg-sage-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {people.error ? (
        <ErrorState message={people.error.message} onRetry={people.reload} />
      ) : people.loading && !people.data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : !people.data?.length ? (
        <Card className="rounded-3xl">
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title="No one added yet"
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
            Showing {shown.length} of {people.data.length} {people.data.length === 1 ? "person" : "people"}
          </p>
          {shown.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <li key={p.id}>
                  <PersonCard person={p} onDelete={() => setToDelete(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="rounded-3xl">
              <EmptyState title="No matches" description="Try a different search or filter." />
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
