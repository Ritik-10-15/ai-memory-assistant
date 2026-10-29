import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageSquareText, Search, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import type { Memory } from "@/api/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  TextAreaField,
} from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, parseServerTime } from "@/lib/format";
import { PageHeader, sourceLabel } from "../components";

export function MemoryComposer({ personId, onAdded }: { personId: string; onAdded: (m: Memory) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Please write the memory first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.addMemory(personId, text.trim()));
      setText("");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <TextAreaField
        label="Add a memory"
        hint="Write it the way you'd say it to the patient, e.g. “You talked about the garden and her new job.”"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone(false);
          setError(null);
        }}
        error={error}
        maxLength={4000}
        rows={3}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          Save memory
        </Button>
        {done && (
          <span role="status" className="text-sm font-medium text-care-600">
            Memory saved.
          </span>
        )}
      </div>
    </form>
  );
}

export function MemoryList({
  memories,
  showPerson,
  onDeleted,
}: {
  memories: Memory[];
  showPerson: boolean;
  onDeleted: (id: number) => void;
}) {
  const [toDelete, setToDelete] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMemory(toDelete.id);
      onDeleted(toDelete.id);
      setToDelete(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!memories.length) {
    return <p className="text-[15px] text-ink-muted">No memories saved yet.</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {memories.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              {showPerson && (
                <Link to={`/caregiver/people/${m.person_id}/edit`} className="font-semibold text-navy hover:underline">
                  {m.person_name}
                </Link>
              )}
              <time dateTime={parseServerTime(m.created_at)?.toISOString()}>{formatDateTime(m.created_at)}</time>
              <Badge tone={m.source === "whisper" ? "info" : "neutral"}>{sourceLabel(m.source)}</Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-danger-700 hover:bg-danger-50"
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setToDelete(m)}
              >
                Delete<span className="sr-only"> memory from {formatDateTime(m.created_at)}</span>
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{m.summary}</p>
            {m.raw_transcript && m.raw_transcript !== m.summary && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-brand-600">Full transcript</summary>
                <p className="mt-1 whitespace-pre-line text-ink-muted">{m.raw_transcript}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this memory?"
        description={
          <>
            <span className="block">“{toDelete?.summary.slice(0, 160)}{(toDelete?.summary.length ?? 0) > 160 ? "…" : ""}”</span>
            <span className="mt-2 block">It will no longer be shown to the patient. This can't be undone.</span>
          </>
        }
        confirmLabel="Delete memory"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={() => {
          setToDelete(null);
          setError(null);
        }}
      />
    </>
  );
}

export function MemoriesPage() {
  const memories = useAsync(() => api.memories(), []);
  const people = useAsync(() => api.people(), []);
  const [personFilter, setPersonFilter] = useState("");
  const [query, setQuery] = useState("");
  const [composerFor, setComposerFor] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (memories.data ?? []).filter(
      (m) =>
        (!personFilter || m.person_id === personFilter) &&
        (!q || m.summary.toLowerCase().includes(q) || m.person_name.toLowerCase().includes(q)),
    );
  }, [memories.data, personFilter, query]);

  const select =
    "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink";

  return (
    <>
      <PageHeader title="Memories" description="Conversation summaries the patient sees and can have read aloud." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="memory-list-heading" className="order-2 lg:order-1">
          <h2 id="memory-list-heading" className="sr-only">
            Saved memories
          </h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="memory-person" className="mb-1.5 block text-sm font-semibold text-navy">
                Person
              </label>
              <select id="memory-person" className={select} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
                <option value="">Everyone</option>
                {(people.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="memory-search" className="mb-1.5 block text-sm font-semibold text-navy">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  id="memory-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Words in the memory"
                  className={`${select} pl-11`}
                />
              </div>
            </div>
          </div>

          {memories.error ? (
            <ErrorState message={memories.error.message} onRetry={memories.reload} />
          ) : memories.loading && !memories.data ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : !memories.data?.length ? (
            <Card>
              <EmptyState
                icon={<MessageSquareText className="h-6 w-6" aria-hidden="true" />}
                title="No memories yet"
                description="Add one here, from a person's profile, or from the patient screen after a visit."
              />
            </Card>
          ) : (
            <>
              <p role="status" className="mb-3 text-sm text-ink-muted">
                Showing {filtered.length} of {memories.data.length} memories
              </p>
              {filtered.length ? (
                <MemoryList
                  memories={filtered}
                  showPerson
                  onDeleted={(id) => memories.setData((prev) => (prev ?? []).filter((m) => m.id !== id))}
                />
              ) : (
                <Card>
                  <EmptyState title="No matching memories" description="Try another person or search term." />
                </Card>
              )}
            </>
          )}
        </section>

        <Card className="order-1 h-fit lg:order-2">
          <CardHeader title="New memory" />
          <CardBody className="space-y-4">
            {people.error ? (
              <Alert tone="error">{people.error.message}</Alert>
            ) : !people.data?.length ? (
              <p className="text-[15px] text-ink-muted">Add a person first, then you can save memories for them.</p>
            ) : (
              <>
                <div>
                  <label htmlFor="composer-person" className="mb-1.5 block text-sm font-semibold text-navy">
                    About
                  </label>
                  <select id="composer-person" className={select} value={composerFor} onChange={(e) => setComposerFor(e.target.value)}>
                    <option value="">Choose a person…</option>
                    {people.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {composerFor && (
                  <MemoryComposer
                    key={composerFor}
                    personId={composerFor}
                    onAdded={(m) => memories.setData((prev) => [m, ...(prev ?? [])])}
                  />
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
