import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffMember } from "../types";
import { aggregateFunnel, seasonOf, type FunnelEvent } from "../funnel";
import { readSampleSeasons, sampleFunnelEvents } from "./finalsite-funnel";
import { fetchLiveFunnelEvents, isLiveFinalsiteApiConfigured } from "./finalsite-api";

/**
 * Refreshes `admissions_funnel_counts` for the current season and the three
 * before it. Same pipeline in both modes:
 *
 *   events (sample fixtures, or Finalsite contacts mapped and dropped)
 *     → aggregateFunnel (cumulative, weekly + same-date, suppressed < 5)
 *     → upsert counts (is_sample = mode === "sample")
 *
 * LIVE needs the API configured AND the funnel approval saved on the
 * Admissions season page. The database refuses live rows without that
 * approval anyway (private.enforce_funnel_live_gate).
 */
export interface FunnelImportOutcome {
  mode: "sample" | "live";
  seasons: number;
  rows: number;
  warnings: string[];
  error: string | null;
}

export const FUNNEL_SEASONS = 4;

export async function runFunnelImport(
  supabase: SupabaseClient,
  staff: StaffMember,
  mode: "sample" | "live",
  today = new Date().toISOString().slice(0, 10)
): Promise<FunnelImportOutcome> {
  const current = seasonOf(today);
  const entryYears = Array.from({ length: FUNNEL_SEASONS }, (_, i) => current - i);
  const outcome: FunnelImportOutcome = { mode, seasons: 0, rows: 0, warnings: [], error: null };
  const { data: run } = await supabase
    .from("import_runs")
    .insert({ system: "finalsite", kind: "funnel", mode, started_by: staff.user_id })
    .select("id")
    .single();

  try {
    let events: FunnelEvent[];
    if (mode === "live") {
      if (!isLiveFinalsiteApiConfigured()) throw new Error("Finalsite API isn't configured on this server.");
      const { data: settings } = await supabase.from("pilot_settings").select("funnel_live_enabled").single();
      if (!settings?.funnel_live_enabled) {
        throw new Error("Live Finalsite counts are locked until approval is saved below.");
      }
      const res = await fetchLiveFunnelEvents(entryYears, current);
      events = res.events;
      outcome.warnings.push(...res.warnings);
    } else {
      const years = new Set(readSampleSeasons().map((s) => s.entryYear));
      const missing = entryYears.filter((y) => !years.has(y));
      if (missing.length) outcome.warnings.push(`Sample file has no season for ${missing.join(", ")}.`);
      events = sampleFunnelEvents();
    }

    const counts = aggregateFunnel(events, entryYears, today);
    outcome.seasons = new Set(events.map((e) => e.entryYear).filter((y) => entryYears.includes(y))).size;
    const rows = counts.map((c) => ({
      entry_year: c.entryYear,
      stage: c.stage,
      cohort: c.cohort,
      as_of: c.asOf,
      count: c.count,
      is_sample: mode === "sample",
      imported_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("admissions_funnel_counts")
        .upsert(rows.slice(i, i + 500), { onConflict: "is_sample,entry_year,stage,cohort,as_of" });
      if (error) throw error;
    }
    outcome.rows = rows.length;
  } catch (e) {
    outcome.error = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  }

  if (run) {
    await supabase
      .from("import_runs")
      .update({
        finished_at: new Date().toISOString(),
        matched: outcome.rows,
        error: outcome.error ?? (outcome.warnings.join("\n") || null),
      })
      .eq("id", run.id);
  }
  return outcome;
}
