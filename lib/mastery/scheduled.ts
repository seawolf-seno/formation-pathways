import "server-only";
import { timingSafeEqual } from "crypto";
import { Client } from "pg";
import { assignmentGrades, canvasEvidence, rollupGrades } from "./canvas-map";
import { assignmentCodes, outcomeCodes } from "./canvas-outcomes";
import { fetchCanvasMastery, isLiveCanvasConfigured } from "./canvas";
import { parseMasteryConfig } from "./config";
import { fileStandardSet } from "./standard-sets";

/**
 * The scheduled Canvas import (Vercel Cron → /api/cron/mastery): every real
 * mastery course with a Canvas course id, for every student on its roster who
 * has a Canvas id, with nobody signed in.
 *
 * It connects as the `mastery_importer` database role
 * (20261020000000_mastery_importer.sql), never the service-role key: that
 * role can read only course ids, rosters and Canvas ids, add Canvas / Khan
 * evidence, and record its runs. RLS and the consent / roster triggers apply.
 * Off until MASTERY_IMPORTER_DATABASE_URL (and CRON_SECRET) are set.
 */
export function isScheduledImportConfigured(): boolean {
  return Boolean(process.env.MASTERY_IMPORTER_DATABASE_URL && process.env.CRON_SECRET && isLiveCanvasConfigured());
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ScheduledRun {
  ran: boolean;
  reason?: string;
  courses: { course: string; added: number; note: string }[];
}

export async function runScheduledImport(now = new Date()): Promise<ScheduledRun> {
  if (!isScheduledImportConfigured())
    return { ran: false, reason: "Not switched on (MASTERY_IMPORTER_DATABASE_URL, CRON_SECRET, Canvas).", courses: [] };
  // Supabase's pooler needs TLS. With its CA certificate (Database settings →
  // SSL) the server is verified too; without it the link is still encrypted.
  const ca = process.env.MASTERY_IMPORTER_CA_CERT?.replace(/\\n/g, "\n");
  const db = new Client({
    connectionString: process.env.MASTERY_IMPORTER_DATABASE_URL,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    statement_timeout: 20_000,
  });
  await db.connect();
  const out: ScheduledRun = { ran: true, courses: [] };
  try {
    // RLS gives this role only real courses that have a Canvas course id.
    const { rows: courses } = await db.query<{ id: string; config_key: string; canvas_course_id: string }>(
      "select id, config_key, canvas_course_id from public.mastery_courses",
    );
    for (const course of courses) {
      const { rows: state } = await db.query<{ paused: boolean }>(
        "select paused from public.mastery_sources where course_id = $1 and source = 'canvas'",
        [course.id],
      );
      if (state[0]?.paused) {
        out.courses.push({ course: course.id, added: 0, note: "paused" });
        continue;
      }
      let note: string;
      let added = 0;
      try {
        // The hub's saved standards if any, else the built-in file.
        const { rows: saved } = await db.query<{ config: Record<string, unknown> }>(
          "select config from public.mastery_standard_sets where key = $1",
          [course.config_key],
        );
        const config = parseMasteryConfig(saved[0]?.config ?? fileStandardSet(course.config_key));
        const { rows: ids } = await db.query<{ person_id: string; external_id: string }>(
          `select r.person_id, e.external_id from public.mastery_roster r
           join public.external_ids e on e.person_id = r.person_id and e.system = 'canvas'
           where r.course_id = $1`,
          [course.id],
        );
        const personByCanvasId = new Map(ids.map((r) => [String(r.external_id), r.person_id]));
        const codes = outcomeCodes(config);
        const objectiveAssignments = assignmentCodes(config);
        const { submissions, outcomeResults, rollups, outcomes } = await fetchCanvasMastery(course.canvas_course_id, [...personByCanvasId.keys()]);
        const { evidence, unmapped } = canvasEvidence(submissions, outcomeResults, personByCanvasId, config, now.toISOString(), codes, objectiveAssignments);
        // Canvas's own objective scores: update, else add (this role can't
        // read the scores it writes, so no upsert).
        for (const g of [...rollupGrades(rollups, outcomes, personByCanvasId, codes), ...assignmentGrades(submissions, personByCanvasId, objectiveAssignments)]) {
          const upd = await db.query(
            `update public.mastery_objective_grades set score = $4, max_score = $5, label = $6, updated_at = $7
             where course_id = $1 and person_id = $2 and standard_code = $3`,
            [course.id, g.person_id, g.standard_code, g.score, g.max_score, g.label, now.toISOString()],
          );
          if (!upd.rowCount)
            await db.query(
              `insert into public.mastery_objective_grades (course_id, person_id, standard_code, score, max_score, label, updated_at)
               values ($1, $2, $3, $4, $5, $6, $7)`,
              [course.id, g.person_id, g.standard_code, g.score, g.max_score, g.label, now.toISOString()],
            );
        }
        const { rows: existing } = await db.query<{ person_id: string; standard_code: string; external_key: string }>(
          "select person_id, standard_code, external_key from public.mastery_evidence where course_id = $1 and external_key is not null",
          [course.id],
        );
        const seen = new Set(existing.map((e) => `${e.person_id}|${e.standard_code}|${e.external_key}`));
        for (const e of evidence) {
          const key = `${e.person_id}|${e.standard_code}|${e.external_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await db.query(
            `insert into public.mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score, occurred_at, external_key)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [course.id, e.person_id, e.standard_code, e.source, e.title, e.score, e.max_score, e.occurred_at, e.external_key],
          );
          added++;
        }
        note =
          `Automatic: ${added} new piece${added === 1 ? "" : "s"} of evidence.` +
          (unmapped.length ? ` ${unmapped.length} Canvas item${unmapped.length === 1 ? "" : "s"} name no standard.` : "");
      } catch (e) {
        // One course failing (a removed Canvas course, a broken standards
        // file) never stops the others; the teacher sees it on the Canvas card.
        note = `Automatic check failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
      }
      await db.query(
        `insert into public.mastery_sources (course_id, source, last_run_at, last_summary) values ($1, 'canvas', $2, $3)
         on conflict (course_id, source) do update set last_run_at = excluded.last_run_at, last_summary = excluded.last_summary`,
        [course.id, now.toISOString(), note.slice(0, 500)],
      );
      await db.query(
        "insert into public.mastery_log (course_id, actor, action, detail) values ($1, null, 'import_canvas_scheduled', $2)",
        [course.id, JSON.stringify({ summary: note.slice(0, 500) })],
      );
      out.courses.push({ course: course.id, added, note });
    }
  } finally {
    await db.end();
  }
  return out;
}
