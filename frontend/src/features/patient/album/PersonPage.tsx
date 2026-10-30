import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Images, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { Button, ButtonLink } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatRelativeDay } from "@/lib/format";
import { usePageTitle } from "../usePageTitle";
import type { Speech } from "../useSpeech";
import { relationshipPhrase } from "../VisitorPanel";
import { LookTogether } from "./LookTogether";
import { PatientEmptyState } from "./PatientEmptyState";
import { AlbumCard, ListenButton, PersonPhoto, buildAlbum } from "./pieces";

/** One loved one: their photo, who they are, when they last visited, and shared memories. */
export function PersonPage({ speech }: { speech: Speech }) {
  const { id = "" } = useParams();
  const detail = useAsync(() => api.familyMember(id), [id]);
  const items = useMemo(() => (detail.data ? buildAlbum(detail.data.memories, detail.data.photos) : []), [detail.data]);
  const [viewing, setViewing] = useState<number | null>(null);
  const person = detail.data?.person;
  usePageTitle(person?.name ?? "Family");

  const back = (
    <ButtonLink to="/family" variant="ghost" size="lg" className="-ml-4 mb-4" icon={<ArrowLeft className="h-5 w-5" aria-hidden="true" />}>
      All family and friends
    </ButtonLink>
  );

  if (detail.error) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div>
        {back}
        <PatientEmptyState
          title={missing ? "I couldn't find this person" : "I couldn't open this page just now"}
          action={
            missing ? (
              <ButtonLink to="/family" size="xl">See everyone</ButtonLink>
            ) : (
              <Button size="xl" variant="secondary" icon={<RefreshCw className="h-6 w-6" aria-hidden="true" />} onClick={detail.reload}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (!person || !detail.data) {
    return (
      <div aria-busy="true">
        {back}
        <div className="h-80 animate-pulse rounded-3xl bg-line/60" />
      </div>
    );
  }

  const relation = relationshipPhrase(person.relationship);
  const first = person.name.split(" ")[0];
  const lastVisit = formatRelativeDay(person.last_visit_at);
  const intro = [`This is ${person.name}.`, relation ? `${relation}.` : "", person.description].filter(Boolean).join(" ");

  return (
    <div>
      {back}
      <section className="grid gap-8 rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8 md:grid-cols-[18rem_minmax(0,1fr)] md:items-center">
        <PersonPhoto id={person.id} name={person.name} className="mx-auto w-full max-w-xs" />
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-ink sm:text-5xl">{person.name}</h1>
          {relation && <p className="mt-2 text-2xl text-sage-700">{relation}</p>}
          {person.description && <p className="mt-4 text-xl leading-relaxed text-ink">{person.description}</p>}
          {lastVisit && (
            <p className="mt-4 text-lg text-ink-muted">
              {first} last visited {lastVisit}.
            </p>
          )}
          <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-base text-ink-muted">
            You're looking through {first}'s album. This doesn't mean {first} is here — the home screen shows who is
            visiting.
          </p>
          <div className="mt-6">
            <ListenButton speech={speech} id={`person:${person.id}`} text={intro} label={`Hear about ${first}`} />
          </div>
        </div>
      </section>

      <section aria-labelledby="shared-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="shared-heading" className="text-3xl font-semibold text-ink">
            Memories with {first}
          </h2>
          {items.length > 1 && (
            <Button size="lg" variant="secondary" icon={<Images className="h-5 w-5" aria-hidden="true" />} onClick={() => setViewing(0)}>
              Look together
            </Button>
          )}
        </div>
        {items.length ? (
          <ul className="mt-6 grid gap-6 md:grid-cols-2">
            {items.map((item, i) => (
              <li key={item.key}>
                <AlbumCard item={item} speech={speech} onOpen={() => setViewing(i)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xl text-ink-muted">
            There are no saved memories or photos with {first} yet.{" "}
            <Link to="/memories" className="font-semibold text-primary-700 underline underline-offset-4">
              See all memories
            </Link>
          </p>
        )}
      </section>

      <LookTogether items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} speech={speech} />
    </div>
  );
}
