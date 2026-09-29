/**
 * Admissions season counts: how many inquiries, applications, admits and
 * enrollments an entering class had as of a date. Pure functions, no I/O, so
 * the same pipeline runs on sample events and on live Finalsite events, and
 * `npm run test:share` can cover it.
 *
 * A "season" is named by the fall the class enters: entry year 2027 is the
 * 2026–27 season, running Aug 1, 2026 → Jul 31, 2027.
 *
 * Nothing here knows who anyone is. A FunnelEvent is four dates and a year;
 * the importer maps each source record to one and drops the record.
 */

export const FUNNEL_STAGES = ["inquiry", "application", "admitted", "enrolled"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const STAGE_LABEL: Record<FunnelStage, string> = {
  inquiry: "Inquiries",
  application: "Applications",
  admitted: "Admitted",
  enrolled: "Enrolled",
};

/** Smallest count we show. 1–4 is stored and shown as "fewer than 5". */
export const MIN_CELL = 5;

/** One student's path through a season. Dates are YYYY-MM-DD or null. */
export interface FunnelEvent {
  entryYear: number;
  inquiredOn: string | null;
  appliedOn: string | null;
  admittedOn: string | null;
  enrolledOn: string | null;
}

/** One row of `admissions_funnel_counts`. `count` null = suppressed. */
export interface FunnelCount {
  entryYear: number;
  stage: FunnelStage;
  cohort: "all";
  asOf: string;
  count: number | null;
}

// ---------------------------------------------------------------- dates

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return utc(y, m, d);
};

/** Entry year of the season `date` falls in. */
export function seasonOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 8 ? y + 1 : y;
}

export const seasonStart = (entryYear: number) => `${entryYear - 1}-08-01`;
export const seasonEnd = (entryYear: number) => `${entryYear}-07-31`;
export const seasonLabel = (entryYear: number) => `${entryYear - 1}–${String(entryYear).slice(2)}`;

/** Days since the season started (Aug 1 = 0). */
export function dayOfSeason(date: string): number {
  const start = parse(seasonStart(seasonOf(date)));
  return Math.round((parse(date).getTime() - start.getTime()) / 86_400_000);
}

/** The same calendar point in another season: Oct 5, 2026 → Oct 5, 2025 for
 *  entry year 2026. Feb 29 falls back to Feb 28. */
export function sameDateInSeason(date: string, entryYear: number): string {
  const shift = entryYear - seasonOf(date);
  const [y, m, d] = date.split("-").map(Number);
  const year = y + shift;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return iso(utc(year, m, m === 2 && d === 29 && !leap ? 28 : d));
}

/** Weekly points from the season start up to `until` (or the season end),
 *  plus `until` itself and the season end, so "to date" and "final" are
 *  always exact rows. */
export function seasonDates(entryYear: number, until: string): string[] {
  const end = seasonEnd(entryYear) < until ? seasonEnd(entryYear) : until;
  const out: string[] = [];
  for (let t = parse(seasonStart(entryYear)); iso(t) <= end; t = new Date(t.getTime() + 7 * 86_400_000)) {
    out.push(iso(t));
  }
  if (end >= seasonStart(entryYear) && out[out.length - 1] !== end) out.push(end);
  return out;
}

// ---------------------------------------------------------------- counting

export function suppress(n: number): number | null {
  return n === 0 || n >= MIN_CELL ? n : null;
}

/** Each stage implies the ones before it: someone admitted without an
 *  inquiry date on file still counts as an inquiry and an application,
 *  from the earliest date we have for them. */
export function stageDates(e: FunnelEvent): Record<FunnelStage, string | null> {
  const min = (...ds: (string | null)[]) =>
    ds.filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  return {
    inquiry: min(e.inquiredOn, e.appliedOn, e.admittedOn, e.enrolledOn),
    application: min(e.appliedOn, e.admittedOn, e.enrolledOn),
    admitted: min(e.admittedOn, e.enrolledOn),
    enrolled: e.enrolledOn,
  };
}

/** Count of sorted dates on or before `date` (binary search). */
function countThrough(sorted: string[], date: string): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Cumulative, suppressed counts for each season in `entryYears`, weekly
 * through `today` (or the season's end), plus the same-date point in every
 * season so this year can be compared with past years at the same moment.
 */
export function aggregateFunnel(events: FunnelEvent[], entryYears: number[], today: string): FunnelCount[] {
  const rows: FunnelCount[] = [];
  for (const year of entryYears) {
    const mine = events.filter((e) => e.entryYear === year);
    const dates = new Set(seasonDates(year, today));
    const sameDate = sameDateInSeason(today, year);
    if (sameDate <= today) dates.add(sameDate);
    for (const stage of FUNNEL_STAGES) {
      const sorted = mine.map((e) => stageDates(e)[stage]).filter((d): d is string => Boolean(d)).sort();
      for (const asOf of [...dates].sort()) {
        rows.push({ entryYear: year, stage, cohort: "all", asOf, count: suppress(countThrough(sorted, asOf)) });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------- the view

export type Counts = Record<FunnelStage, number | null>;

export interface SeasonSummary {
  entryYear: number;
  label: string;
  isCurrent: boolean;
  /** As of the same calendar date as today. */
  toDate: Counts;
  /** At season end; null for the season still under way. */
  final: Counts | null;
}

export interface SeasonView {
  today: string;
  current: SeasonSummary;
  /** Most recent first. */
  prior: SeasonSummary[];
  /** Cumulative points per season per stage, for the pace chart. */
  series: { entryYear: number; label: string; isCurrent: boolean; points: Record<FunnelStage, { day: number; count: number | null }[]> }[];
}

/** a / b as a ratio, or null when either is unknown or b is 0. */
export function rate(a: number | null, b: number | null): number | null {
  return a == null || b == null || b === 0 ? null : a / b;
}

export function buildSeasonView(rows: FunnelCount[], today: string, priorSeasons = 3): SeasonView | null {
  const currentYear = seasonOf(today);
  const years = [...new Set(rows.map((r) => r.entryYear))]
    .filter((y) => y <= currentYear)
    .sort((a, b) => b - a)
    .slice(0, priorSeasons + 1);
  if (!years.includes(currentYear)) return null;

  const byKey = new Map(rows.map((r) => [`${r.entryYear}|${r.stage}|${r.asOf}`, r.count]));
  const countsAt = (year: number, asOf: string): Counts =>
    Object.fromEntries(FUNNEL_STAGES.map((s) => [s, byKey.get(`${year}|${s}|${asOf}`) ?? null])) as Counts;

  const summary = (year: number): SeasonSummary => ({
    entryYear: year,
    label: seasonLabel(year),
    isCurrent: year === currentYear,
    toDate: countsAt(year, sameDateInSeason(today, year)),
    final: year === currentYear ? null : countsAt(year, seasonEnd(year)),
  });

  const series = years.map((year) => {
    const mine = rows.filter((r) => r.entryYear === year && r.asOf <= (year === currentYear ? today : seasonEnd(year)));
    const points = Object.fromEntries(
      FUNNEL_STAGES.map((s) => [
        s,
        mine
          .filter((r) => r.stage === s)
          .sort((a, b) => (a.asOf < b.asOf ? -1 : 1))
          .map((r) => ({ day: dayOfSeason(r.asOf), count: r.count })),
      ])
    ) as SeasonView["series"][number]["points"];
    return { entryYear: year, label: seasonLabel(year), isCurrent: year === currentYear, points };
  });

  return {
    today,
    current: summary(currentYear),
    prior: years.filter((y) => y !== currentYear).map(summary),
    series,
  };
}
