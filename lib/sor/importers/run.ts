import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceSystem, StaffMember } from "../types";
import { readFinalsiteCsv, readSampleFinalsite, stageFromFinalsiteStatus, type FinalsiteRecord } from "./finalsite";
import { fetchLiveBlackbaud, isLiveBlackbaudConfigured, readSampleBlackbaud, type BlackbaudRecord } from "./blackbaud";
import { fetchLiveCanvas, isLiveCanvasPilotConfigured, readSampleCanvas, type CanvasCourseRecord } from "./canvas";
import { fetchLiveFinalsiteStudents, isLiveFinalsiteApiConfigured } from "./finalsite-api";

/**
 * Runs one source import. The pipeline is identical in both modes:
 *
 *   1. Build an allowlist from external_ids — people an admin already added
 *      to the pilot. Importers never create people.
 *   2. SAMPLE mode reads fixtures/sample/* for sample (fictional) people.
 *      LIVE mode calls the real source for real people — only when the
 *      leadership gate is open, and only for people with an active
 *      import_records consent. Real people without consent are counted as
 *      skipped and never requested from the source.
 *   3. Write normalized rows. Postgres triggers re-check consent on every
 *      row, so a bug here still can't write an unconsented record.
 */
export interface ImportOutcome {
  system: SourceSystem;
  mode: "sample" | "live";
  matched: number;
  skippedNoConsent: number;
  unmatched: number;
  warnings: string[];
  error: string | null;
}

interface Target {
  personId: string;
  externalId: string;
  stage: string;
}

export async function runImport(
  supabase: SupabaseClient,
  staff: StaffMember,
  system: SourceSystem,
  opts: { finalsiteCsv?: string; blackbaudToken?: string | null } = {}
): Promise<ImportOutcome> {
  const bbToken = opts.blackbaudToken ?? process.env.BLACKBAUD_ACCESS_TOKEN ?? null;
  const { data: settings } = await supabase.from("pilot_settings").select("real_data_enabled").single();
  const finalsiteApi = system === "finalsite" && !opts.finalsiteCsv && isLiveFinalsiteApiConfigured();
  const live =
    system === "finalsite" ? Boolean(opts.finalsiteCsv) || finalsiteApi
    : system === "blackbaud" ? isLiveBlackbaudConfigured(bbToken)
    : isLiveCanvasPilotConfigured();
  const mode = live ? "live" : "sample";

  const outcome: ImportOutcome = {
    system, mode, matched: 0, skippedNoConsent: 0, unmatched: 0, warnings: [], error: null,
  };
  const { data: run } = await supabase
    .from("import_runs")
    .insert({ system, mode, started_by: staff.user_id })
    .select("id")
    .single();

  try {
    if (live && !settings?.real_data_enabled) {
      throw new Error("Live import is locked until leadership sign-off is saved on the Pilot page.");
    }

    const { data: rows, error } = await supabase
      .from("external_ids")
      .select("external_id, person_id, people!inner(stage, is_sample, consents(scope, revoked_at))")
      .eq("system", system);
    if (error) throw error;

    const targets = new Map<string, Target>();
    for (const row of rows ?? []) {
      const p = row.people as unknown as {
        stage: string;
        is_sample: boolean;
        consents: { scope: string; revoked_at: string | null }[];
      };
      if (p.is_sample !== !live) continue; // sample fixtures ↔ sample people; live source ↔ real people
      const consented =
        p.is_sample || p.consents.some((c) => c.scope === "import_records" && !c.revoked_at);
      if (!consented) {
        outcome.skippedNoConsent++;
        continue;
      }
      targets.set(row.external_id, { personId: row.person_id, externalId: row.external_id, stage: p.stage });
    }
    const allowlist = new Set(targets.keys());

    let found = new Set<string>();
    if (system === "finalsite" && finalsiteApi) {
      // Pilot students who have no Finalsite id yet can be matched by their
      // Blackbaud id, when Finalsite stores it (FINALSITE_SIS_ID_FIELD).
      const byBlackbaud = await blackbaudTargetsWithoutFinalsite(supabase, new Set([...targets.values()].map((t) => t.personId)));
      outcome.skippedNoConsent += byBlackbaud.skippedNoConsent;
      const res = await fetchLiveFinalsiteStudents({ contactIds: allowlist, blackbaudIds: new Set(byBlackbaud.targets.keys()) });
      outcome.warnings.push(...res.warnings);
      for (const m of res.matches) {
        const t = m.by === "contact" ? targets.get(m.key)! : byBlackbaud.targets.get(m.key)!;
        await writeFinalsite(supabase, t, { ...m.record, externalId: m.record.contactId, activities: [] });
        if (m.by === "blackbaud") {
          // Remember the Finalsite id, so later imports match directly.
          await must(supabase.from("external_ids").insert({ person_id: t.personId, system: "finalsite", external_id: m.record.contactId }));
        }
      }
      found = new Set(res.matches.map((m) => `${m.by}:${m.key}`));
      outcome.matched = found.size;
      outcome.unmatched = allowlist.size + byBlackbaud.targets.size - found.size;
    } else if (system === "finalsite") {
      const records = live ? readFinalsiteCsv(opts.finalsiteCsv!, allowlist) : readSampleFinalsite(allowlist);
      for (const r of records) await writeFinalsite(supabase, targets.get(r.externalId)!, r);
      found = new Set(records.map((r) => r.externalId));
    } else if (system === "blackbaud") {
      let records: BlackbaudRecord[];
      if (live) {
        const res = await fetchLiveBlackbaud(allowlist, bbToken!);
        records = res.records;
        outcome.warnings.push(...res.warnings);
      } else records = readSampleBlackbaud(allowlist);
      for (const r of records) await writeBlackbaud(supabase, targets.get(r.externalId)!, r);
      found = new Set(records.map((r) => r.externalId));
    } else {
      const courses = live ? await fetchLiveCanvas(allowlist) : readSampleCanvas(allowlist);
      for (const c of courses) await writeCanvas(supabase, targets, c);
      found = new Set(courses.flatMap((c) => c.students.map((s) => s.externalId)));
    }

    if (!finalsiteApi) {
      outcome.matched = found.size;
      outcome.unmatched = allowlist.size - found.size;
    }
  } catch (e) {
    outcome.error = e instanceof Error ? e.message : String(e);
  }

  if (run) {
    await supabase
      .from("import_runs")
      .update({
        finished_at: new Date().toISOString(),
        matched: outcome.matched,
        skipped_no_consent: outcome.skippedNoConsent,
        unmatched: outcome.unmatched,
        error: outcome.error ?? (outcome.warnings.join("\n") || null),
      })
      .eq("id", run.id);
  }
  return outcome;
}

async function must<T extends { error: unknown }>(p: PromiseLike<T>) {
  const res = await p;
  if (res.error) throw res.error;
  return res;
}

async function writeFinalsite(supabase: SupabaseClient, t: Target, r: FinalsiteRecord) {
  await must(
    supabase.from("admissions_records").upsert({
      person_id: t.personId,
      entry_year: r.entryYear,
      entering_grade: r.enteringGrade,
      application_status: r.status,
      previous_school: r.previousSchool,
      interests: r.interests,
      activities: r.activities,
      responses: r.responses,
      imported_at: new Date().toISOString(),
    })
  );
  // Finalsite only moves someone forward through admissions; Blackbaud owns
  // "enrolled" and beyond.
  const next = stageFromFinalsiteStatus(r.status);
  if (next === "admitted" && t.stage === "applicant") {
    await must(supabase.from("people").update({ stage: next }).eq("id", t.personId));
  }
}

/** Consented real pilot students with a Blackbaud id but no Finalsite id,
 *  keyed by Blackbaud id (for matching through Finalsite's id fields). */
async function blackbaudTargetsWithoutFinalsite(
  supabase: SupabaseClient,
  alreadyTargeted: Set<string>
): Promise<{ targets: Map<string, Target>; skippedNoConsent: number }> {
  const { data, error } = await supabase
    .from("external_ids")
    .select("external_id, person_id, people!inner(stage, is_sample, consents(scope, revoked_at), external_ids(system))")
    .eq("system", "blackbaud");
  if (error) throw error;
  const targets = new Map<string, Target>();
  let skippedNoConsent = 0;
  for (const row of data ?? []) {
    const p = row.people as unknown as {
      stage: string;
      is_sample: boolean;
      consents: { scope: string; revoked_at: string | null }[];
      external_ids: { system: string }[];
    };
    if (p.is_sample || alreadyTargeted.has(row.person_id)) continue;
    if (p.external_ids.some((x) => x.system === "finalsite")) continue;
    if (!p.consents.some((c) => c.scope === "import_records" && !c.revoked_at)) {
      skippedNoConsent++;
      continue;
    }
    targets.set(row.external_id, { personId: row.person_id, externalId: row.external_id, stage: p.stage });
  }
  return { targets, skippedNoConsent };
}

async function writeBlackbaud(supabase: SupabaseClient, t: Target, r: BlackbaudRecord) {
  await must(
    supabase.from("enrollments").upsert({
      person_id: t.personId,
      grade: r.grade,
      grad_year: r.gradYear,
      advisor_name: r.advisorName,
      enrolled_since: r.enrolledSince,
      imported_at: new Date().toISOString(),
    })
  );
  await must(
    supabase
      .from("people")
      .update({
        stage: "enrolled",
        current_grade: r.grade,
        grad_year: r.gradYear,
        ...(r.preferredName ? { preferred_name: r.preferredName } : {}),
      })
      .eq("id", t.personId)
  );
}

async function writeCanvas(supabase: SupabaseClient, targets: Map<string, Target>, c: CanvasCourseRecord) {
  for (const s of c.students) {
    const t = targets.get(s.externalId);
    if (!t) continue;
    await must(
      supabase.from("course_enrollments").upsert({
        person_id: t.personId,
        canvas_course_id: c.canvasCourseId,
        course_name: c.courseName,
        teacher_name: c.teacherName,
        imported_at: new Date().toISOString(),
      })
    );
    if (s.evidence.length) {
      await must(
        supabase.from("academic_evidence").upsert(
          s.evidence.map((e) => ({
            person_id: t.personId,
            canvas_course_id: c.canvasCourseId,
            assignment_name: e.assignmentName,
            submitted_at: e.submittedAt,
            late: e.late,
            missing: e.missing,
            teacher_comment: e.teacherComment,
            imported_at: new Date().toISOString(),
          })),
          { onConflict: "person_id,canvas_course_id,assignment_name" }
        )
      );
    }
  }
}
