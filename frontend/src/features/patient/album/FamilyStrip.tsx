import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Avatar } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";

/** Home: the people in the patient's life, one tap away. Hidden if empty or unavailable. */
export function FamilyStrip() {
  const family = useAsync(() => api.family(), []);
  const people = family.data ?? [];
  if (!people.length) return null;

  return (
    <section aria-labelledby="family-strip-heading" className="rounded-3xl border border-line bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="family-strip-heading" className="text-2xl font-semibold text-ink">
          Your family and friends
        </h2>
        <Link to="/family" className="text-lg font-semibold text-primary-700 underline-offset-4 hover:underline">
          See everyone
        </Link>
      </div>
      <ul className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {people.slice(0, 6).map((p) => (
          <li key={p.id}>
            <Link to={`/family/${p.id}`} className="flex flex-col items-center gap-2 rounded-2xl p-1 text-center hover:bg-primary-50">
              <Avatar name={p.name} src={api.personPhotoUrl(p.id)} size="lg" className="ring-4 ring-paper" />
              <span className="line-clamp-2 text-base font-semibold leading-tight text-ink">{p.name.split(" ")[0]}</span>
              {p.relationship && <span className="-mt-1 line-clamp-1 text-sm text-ink-muted">{p.relationship}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
