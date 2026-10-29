/**
 * SQLite's CURRENT_TIMESTAMP is UTC without a zone marker
 * ("2026-07-07 20:05:34"). Parse it as UTC so local display is correct.
 */
export function parseServerTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  const d = parseServerTime(value);
  return d ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
}

export function formatShortDate(value: string | null | undefined): string {
  const d = parseServerTime(value);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parseServerTime(value);
  return d
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
}

/** "today", "yesterday", "3 days ago", then a full date — calm phrasing for the patient. */
export function formatRelativeDay(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseServerTime(value);
  if (!d) return "";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${formatDate(value)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** "sarah johnson" → "Sarah Johnson" (names are stored as typed). */
export function titleCase(name: string | null | undefined): string {
  return (name ?? "").replace(/(^|\s|-)(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  // Only words that start with a letter: "Priya Patel (demo)" → "PP", not "P(".
  const parts = (name ?? "").trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
