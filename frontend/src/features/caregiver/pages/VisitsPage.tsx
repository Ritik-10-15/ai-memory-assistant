import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, Download, Table2 } from "lucide-react";
import { api } from "@/api/client";
import type { Analytics, Visit } from "@/api/types";
import { Avatar, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, formatDuration, formatShortDate, parseServerTime } from "@/lib/format";
import { PageHeader, StatTile } from "../components";

// Single-series charts: one validated mark color (brand-500, 4.7:1 on the
// white card), recessive grid/axes in muted ink, no legend (the title names
// the series), hover tooltip, and a table view for every chart.
const MARK = "#3478B4";
const AXIS = "#5B6B7F";
const GRID = "#E6EBF2";
const RANGES = [7, 30, 90] as const;

/** Fill in missing days so the chart shows quiet days as zero, not gaps. */
export function lastNDays(daily: Analytics["daily"], days = 30, now = new Date()) {
  const counts = new Map(daily.map((d) => [d.day, d.visits]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1 - i)));
    const key = d.toISOString().slice(0, 10);
    return {
      day: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      visits: counts.get(key) ?? 0,
    };
  });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const n = payload[0].value;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-raised">
      <p className="font-semibold text-navy">{label}</p>
      <p className="text-ink">
        {n} visit{n === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  chart,
  table,
}: {
  title: string;
  description: string;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <Button variant="ghost" size="sm" aria-pressed={asTable} icon={<Table2 className="h-4 w-4" aria-hidden="true" />} onClick={() => setAsTable((t) => !t)}>
            {asTable ? "Show chart" : "Show table"}
          </Button>
        }
      />
      <CardBody>{asTable ? table : <div aria-hidden="true">{chart}</div>}</CardBody>
    </Card>
  );
}

function DataTable({ headers, rows }: { headers: [string, string]; rows: Array<[string, ReactNode]> }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left text-[15px]">
        <thead className="sticky top-0 bg-white text-sm text-ink-muted">
          <tr>
            <th scope="col" className="py-2 font-medium">{headers[0]}</th>
            <th scope="col" className="py-2 text-right font-medium">{headers[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td className="py-2 text-ink">{a}</td>
              <td className="py-2 text-right tabular-nums text-ink">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupByDay(visits: Visit[]) {
  const groups = new Map<string, Visit[]>();
  for (const v of visits) {
    const d = parseServerTime(v.started_at);
    const key = d ? d.toLocaleDateString("en-CA") : "unknown";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.entries()];
}

export function VisitsPage() {
  const visits = useAsync(() => api.visits(1000), []);
  const analytics = useAsync(() => api.analytics(), []);
  const [person, setPerson] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number] | 0>(30);

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    (visits.data ?? []).forEach((v) => seen.set(v.person_id, v.person_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [visits.data]);

  const filtered = useMemo(() => {
    const cutoff = range ? Date.now() - range * 86_400_000 : 0;
    return (visits.data ?? []).filter(
      (v) => (!person || v.person_id === person) && (parseServerTime(v.started_at)?.getTime() ?? 0) >= cutoff,
    );
  }, [visits.data, person, range]);

  const totalDuration = filtered.reduce((s, v) => s + (v.duration_s || 0), 0);
  const withDuration = filtered.filter((v) => v.duration_s > 0).length;
  const daily = analytics.data ? lastNDays(analytics.data.daily) : [];
  const perPerson = (analytics.data?.per_person ?? []).filter((p) => p.visits > 0).slice(0, 8);
  const control = "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink";

  return (
    <>
      <PageHeader
        title="Visit history"
        description="A visit is one continuous stay in front of the camera by someone who was confidently recognised."
        actions={
          <a
            href="/caregiver/export/csv"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy hover:bg-brand-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </a>
        }
      />

      {analytics.error ? (
        <ErrorState message={analytics.error.message} onRetry={analytics.reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Visits per day"
            description="Last 30 days"
            chart={
              analytics.data ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} interval={6} />
                      <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(52,120,180,0.08)" }} />
                      <Bar dataKey="visits" fill={MARK} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Skeleton className="h-60" />
              )
            }
            table={<DataTable headers={["Day", "Visits"]} rows={[...daily].reverse().map((d) => [d.label, d.visits])} />}
          />
          <ChartCard
            title="Visits per person"
            description="All time, most frequent first"
            chart={
              !analytics.data ? (
                <Skeleton className="h-60" />
              ) : perPerson.length ? (
                <div style={{ height: Math.max(120, perPerson.length * 34 + 24) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perPerson} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={4}>
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fill: AXIS, fontSize: 13 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(52,120,180,0.08)" }} />
                      <Bar dataKey="visits" fill={MARK} radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-[15px] text-ink-muted">No visits yet.</p>
              )
            }
            table={
              <DataTable
                headers={["Person", "Visits"]}
                rows={(analytics.data?.per_person ?? []).map((p) => [p.name, p.visits])}
              />
            }
          />
        </div>
      )}

      <section aria-labelledby="timeline-heading" className="mt-8">
        <h2 id="timeline-heading" className="mb-4 text-lg font-semibold text-navy">
          Timeline
        </h2>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <div>
            <label htmlFor="visit-person" className="mb-1.5 block text-sm font-semibold text-navy">
              Visitor
            </label>
            <select id="visit-person" className={control} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Everyone</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="visit-range" className="mb-1.5 block text-sm font-semibold text-navy">
              Period
            </label>
            <select id="visit-range" className={control} value={range} onChange={(e) => setRange(Number(e.target.value) as typeof range)}>
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  Last {r} days
                </option>
              ))}
              <option value={0}>All time</option>
            </select>
          </div>
        </div>

        {visits.error ? (
          <ErrorState message={visits.error.message} onRetry={visits.reload} />
        ) : visits.loading && !visits.data ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatTile label="Visits in period" value={filtered.length} />
              <StatTile label="Different visitors" value={new Set(filtered.map((v) => v.person_id)).size} />
              <StatTile
                label="Average length"
                value={withDuration ? formatDuration(Math.round(totalDuration / withDuration)) : "—"}
              />
            </div>
            {filtered.length ? (
              <ol className="space-y-6">
                {groupByDay(filtered).map(([day, items]) => (
                  <li key={day}>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                      {formatDate(items[0].started_at)}
                    </h3>
                    <Card>
                      <ol className="divide-y divide-line">
                        {items.map((v) => (
                          <li key={v.id} className="flex items-center gap-4 px-5 py-3.5">
                            <time className="w-20 shrink-0 text-sm tabular-nums text-ink-muted" dateTime={parseServerTime(v.started_at)?.toISOString()}>
                              {parseServerTime(v.started_at)?.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </time>
                            <Avatar name={v.person_name} src={api.personPhotoUrl(v.person_id)} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-ink">{v.person_name}</p>
                              <p className="truncate text-sm text-ink-muted">{v.relationship || "—"}</p>
                            </div>
                            <span className="shrink-0 text-sm text-ink-muted">
                              {v.ended_at ? formatDuration(v.duration_s) : "In progress"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </Card>
                  </li>
                ))}
              </ol>
            ) : (
              <Card>
                <EmptyState
                  icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
                  title={visits.data?.length ? "No visits match these filters" : "No visits recorded yet"}
                  description={
                    visits.data?.length
                      ? `Try a longer period${person ? " or everyone" : ""}.`
                      : "Visits are logged automatically when an enrolled person is recognised."
                  }
                />
              </Card>
            )}
            {visits.data && visits.data.length >= 1000 && (
              <p className="mt-3 text-sm text-ink-muted">
                Showing the latest 1,000 visits. Export CSV for the full history (first: {formatShortDate(visits.data.at(-1)?.started_at)}).
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
