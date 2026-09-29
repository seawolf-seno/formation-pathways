import fs from "fs";
import path from "path";
import type { FunnelEvent } from "../funnel";

/**
 * Sample mode for the Admissions season dashboard: turns the FICTIONAL season
 * totals in fixtures/sample/finalsite-funnel.json into dated FunnelEvents
 * with a typical admissions rhythm (inquiries through the fall, applications
 * before a mid-January deadline, decisions in March, deposits by April).
 * Seeded per season, so the same totals always draw the same chart.
 *
 * Live mode produces the same FunnelEvent shape from Finalsite's API
 * (./finalsite-api.ts), so everything downstream is identical.
 */
interface SampleSeason {
  entryYear: number;
  inquiries: number;
  applications: number;
  admitted: number;
  enrolled: number;
}

export function readSampleSeasons(): SampleSeason[] {
  const file = path.join(process.cwd(), "fixtures/sample/finalsite-funnel.json");
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { seasons: SampleSeason[] }).seasons;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Days since Aug 1 for the key dates of a typical season.
const APP_DEADLINE = 167; // ~Jan 15
const DECISION_DAY = 221; // ~Mar 10
const DEPOSIT_DAY = 243; // ~Apr 1

export function sampleFunnelEvents(seasons: SampleSeason[] = readSampleSeasons()): FunnelEvent[] {
  const events: FunnelEvent[] = [];
  for (const s of seasons) {
    const rand = mulberry32(s.entryYear);
    const normal = (mean: number, sd: number) =>
      mean + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const clamp = (d: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, d)));
    const start = Date.UTC(s.entryYear - 1, 7, 1); // the season opens Aug 1
    const at = (day: number) => new Date(start + day * 86_400_000).toISOString().slice(0, 10);

    for (let i = 0; i < s.inquiries; i++) {
      const inquiry = rand() < 0.6 ? clamp(normal(75, 40), 0, 300) : clamp(rand() * 200, 0, 300);
      let application: number | null = null;
      let admitted: number | null = null;
      let enrolled: number | null = null;
      if (i < s.applications) {
        // Late (rolling) applications: a few by choice, and anyone who only
        // inquired after the deadline.
        // Early applicants apply soon after applications open in September.
        const late = rand() < 0.08 || inquiry + 7 > APP_DEADLINE;
        const early = !late && rand() < 0.15;
        application = late
          ? clamp(Math.max(inquiry + 7, APP_DEADLINE + rand() * 60), inquiry, 330)
          : early
            ? clamp(Math.max(inquiry + 7, 31 + rand() * 90), inquiry, APP_DEADLINE)
            : clamp(Math.max(inquiry + 7, normal(140, 22)), inquiry, APP_DEADLINE);
      }
      if (application != null && i < s.admitted) {
        admitted = application > APP_DEADLINE ? clamp(application + 21 + rand() * 20, application, 330) : DECISION_DAY;
      }
      if (admitted != null && i < s.enrolled) {
        enrolled = clamp(Math.min(DEPOSIT_DAY + rand() * 20, admitted + 3 + rand() * 25), admitted, 350);
      }
      events.push({
        entryYear: s.entryYear,
        inquiredOn: at(inquiry),
        appliedOn: application == null ? null : at(application),
        admittedOn: admitted == null ? null : at(admitted),
        enrolledOn: enrolled == null ? null : at(enrolled),
      });
    }
  }
  return events;
}
