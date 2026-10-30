import { Link } from "react-router-dom";
import { RefreshCw, Users } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { usePageTitle } from "../usePageTitle";
import { PersonPhoto } from "./pieces";
import { PatientEmptyState } from "./PatientEmptyState";

/** Family & friends: an album of the people in the patient's life. */
export function FamilyPage() {
  usePageTitle("Family and friends");
  const family = useAsync(() => api.family(), []);

  return (
    <div>
      <h1 className="text-4xl font-semibold text-ink sm:text-5xl">Family and friends</h1>
      <p className="mt-2 text-xl text-ink-muted">Tap someone to see their photos and memories.</p>

      <div className="mt-8">
        {family.error ? (
          <PatientEmptyState
            title="I couldn't open the family album just now"
            action={
              <Button size="xl" variant="secondary" icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />} onClick={family.reload}>
                Try again
              </Button>
            }
          />
        ) : !family.data ? (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading family">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-96 animate-pulse rounded-3xl bg-line/60" />
            ))}
          </ul>
        ) : !family.data.length ? (
          <PatientEmptyState
            icon={<Users className="h-10 w-10" aria-hidden="true" />}
            title="No one has been added yet"
            text="A caregiver can add family and friends, with their photos."
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {family.data.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/family/${p.id}`}
                  className="group flex h-full items-center gap-4 rounded-3xl border border-line bg-card p-4 shadow-card transition-shadow hover:shadow-raised sm:flex-col sm:items-stretch"
                >
                  <PersonPhoto id={p.id} name={p.name} aspect="aspect-square sm:aspect-[4/5]" className="w-28 shrink-0 shadow-none ring-0 sm:w-full" />
                  <div className="flex min-w-0 flex-1 flex-col sm:px-2 sm:pb-2 sm:pt-4">
                    <h2 className="text-2xl font-semibold leading-snug text-ink group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
                      {p.name}
                    </h2>
                    {p.relationship && <p className="mt-0.5 text-xl text-sage-700">{p.relationship}</p>}
                    {p.description && <p className="mt-3 line-clamp-2 text-lg text-ink">{p.description}</p>}
                    {p.recent_memory && (
                      <p className="mt-3 line-clamp-2 border-t border-line pt-3 text-lg text-ink-muted">
                        <span className="font-semibold text-ink">Last time: </span>
                        {p.recent_memory.summary}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
