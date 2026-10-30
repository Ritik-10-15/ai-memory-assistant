import { useMemo, useState, type FormEvent } from "react";
import { MessageSquareText, Search } from "lucide-react";
import { api } from "@/api/client";
import type { Memory } from "@/api/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  TextAreaField,
} from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "../components";
import { MemoryTimeline } from "../MemoryCard";

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
          <span role="status" className="text-sm font-medium text-sage-700">
            Memory saved.
          </span>
        )}
      </div>
    </form>
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
    "block w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink";

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
              <label htmlFor="memory-person" className="mb-1.5 block text-sm font-semibold text-ink">
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
              <label htmlFor="memory-search" className="mb-1.5 block text-sm font-semibold text-ink">
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
                <MemoryTimeline
                  memories={filtered}
                  showPerson
                  onUpdated={(m) => memories.setData((prev) => (prev ?? []).map((x) => (x.id === m.id ? m : x)))}
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
                  <label htmlFor="composer-person" className="mb-1.5 block text-sm font-semibold text-ink">
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
