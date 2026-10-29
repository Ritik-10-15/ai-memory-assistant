import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, CircleAlert, MessageSquareText, Plus, ScanFace, Users } from "lucide-react";
import { api } from "@/api/client";
import type { AppStatus, Memory, Person, Visit } from "@/api/types";
import { Avatar, ButtonLink, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, formatDuration, parseServerTime } from "@/lib/format";
import { enrollmentStatus, PageHeader, sourceLabel, StatTile } from "../components";

type Activity =
  | { kind: "visit"; at: string; item: Visit }
  | { kind: "memory"; at: string; item: Memory };

function recentActivity(visits: Visit[], memories: Memory[], limit = 8): Activity[] {
  const items: Activity[] = [
    ...visits.map((v) => ({ kind: "visit" as const, at: v.started_at, item: v })),
    ...memories.map((m) => ({ kind: "memory" as const, at: m.created_at, item: m })),
  ];
  const time = (a: Activity) => parseServerTime(a.at)?.getTime() ?? 0;
  return items.sort((a, b) => time(b) - time(a)).slice(0, limit);
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage-600" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-caution-600" aria-hidden="true" />
      )}
      <div>
        <p className="text-[15px] font-medium text-ink">
          {label} <span className="sr-only">{ok ? "(working)" : "(needs attention)"}</span>
        </p>
        <p className="text-sm text-ink-muted">{detail}</p>
      </div>
    </li>
  );
}

function SystemStatus({ status }: { status: AppStatus }) {
  return (
    <ul className="divide-y divide-line">
      <StatusRow
        ok={status.models_loaded}
        label="Face recognition engine"
        detail={status.models_loaded ? "Detection and recognition models are loaded." : "Models are not loaded."}
      />
      <StatusRow
        ok={status.enrolled_people > 0}
        label="Recognisable people"
        detail={
          status.enrolled_people > 0
            ? `${status.enrolled_people} ${status.enrolled_people === 1 ? "person" : "people"}, ${status.gallery_embeddings} face samples.`
            : "No one can be recognised yet — enroll a face to start."
        }
      />
      <StatusRow
        ok
        label="Camera"
        detail={status.camera_mode === "browser" ? "Uses the patient device's camera (browser)." : "Uses the camera attached to the server."}
      />
      <StatusRow
        ok={status.voice_memos}
        label="Voice memos"
        detail={status.voice_memos ? "Recordings are transcribed into notes." : "Not available on this server (Whisper not installed)."}
      />
    </ul>
  );
}

export function OverviewPage() {
  const stats = useAsync(() => api.stats(), []);
  const status = useAsync(() => api.status(), []);
  const people = useAsync(() => api.people(), []);
  const activity = useAsync(async () => {
    const [visits, memories] = await Promise.all([api.visits(10), api.memories()]);
    return recentActivity(visits, memories);
  }, []);

  const needsEnrollment = (people.data ?? []).filter((p: Person) => enrollmentStatus(p) !== "enrolled");

  return (
    <>
      <PageHeader
        title="Overview"
        description="How the Memory Assistant is doing, and what has happened recently."
        actions={
          <ButtonLink to="/caregiver/people/add" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Add person
          </ButtonLink>
        }
      />

      {stats.error ? (
        <ErrorState message={stats.error.message} onRetry={stats.reload} />
      ) : (
        <section aria-label="Totals" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Registered people", value: stats.data?.total_people, icon: <Users className="h-5 w-5" aria-hidden="true" /> },
            { label: "Visits today", value: stats.data?.today_visits, icon: <CalendarClock className="h-5 w-5" aria-hidden="true" /> },
            { label: "All visits", value: stats.data?.total_visits, icon: <CalendarClock className="h-5 w-5" aria-hidden="true" /> },
            { label: "Saved memories", value: stats.data?.total_memories, icon: <MessageSquareText className="h-5 w-5" aria-hidden="true" /> },
          ].map((s) => (
            <StatTile key={s.label} label={s.label} icon={s.icon} value={s.value ?? <Skeleton className="h-8 w-12" />} />
          ))}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Recent activity"
            description="Visits and saved memories, newest first."
            action={
              <Link to="/caregiver/visits" className="text-sm font-semibold text-primary-700 hover:underline">
                Visit history
              </Link>
            }
          />
          <CardBody className="py-2">
            {activity.loading && !activity.data ? (
              <div className="space-y-3 py-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : activity.error ? (
              <div className="py-3">
                <ErrorState message={activity.error.message} onRetry={activity.reload} />
              </div>
            ) : !activity.data?.length ? (
              <EmptyState
                icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
                title="Nothing yet"
                description="Visits appear here when someone enrolled is recognised. Memories appear when they're saved."
              />
            ) : (
              <ul className="divide-y divide-line">
                {activity.data.map((a) => (
                  <li key={`${a.kind}-${a.item.id}`} className="flex items-start gap-3 py-3">
                    <Avatar name={a.item.person_name} src={api.personPhotoUrl(a.item.person_id)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink">
                        <span className="font-semibold">{a.item.person_name}</span>{" "}
                        {a.kind === "visit"
                          ? `visited${a.item.duration_s ? ` for ${formatDuration(a.item.duration_s)}` : ""}`
                          : `— ${sourceLabel(a.item.source).toLowerCase()} saved`}
                      </p>
                      {a.kind === "memory" && <p className="truncate text-sm text-ink-muted">{a.item.summary}</p>}
                    </div>
                    <time className="shrink-0 text-sm text-ink-muted" dateTime={parseServerTime(a.at)?.toISOString()}>
                      {formatDateTime(a.at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="System status" />
            <CardBody className="py-2">
              {status.error ? (
                <div className="py-3">
                  <ErrorState message={status.error.message} onRetry={status.reload} />
                </div>
              ) : status.data ? (
                <SystemStatus status={status.data} />
              ) : (
                <Skeleton className="my-3 h-32" />
              )}
            </CardBody>
          </Card>

          {needsEnrollment.length > 0 && (
            <Card>
              <CardHeader title="Needs face enrollment" description="These people can't be recognised yet." />
              <CardBody className="py-2">
                <ul className="divide-y divide-line">
                  {needsEnrollment.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="truncate font-medium text-ink">{p.name}</span>
                      <Link
                        to={`/caregiver/enroll/${p.id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
                      >
                        <ScanFace className="h-4 w-4" aria-hidden="true" />
                        Enroll<span className="sr-only"> {p.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
