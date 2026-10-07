// Is the live database behind the code? Compares what the migrations create
// (lib/sor/schema-expectations.ts) with what the Data API can actually see,
// using zero-row selects as the signed-in admin: a missing table or column
// fails the query, and no row is ever returned. Shown to admins on /pilot.
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { byTable, expectedSchema, type ExpectedColumn } from "./schema-expectations.ts";

export interface DriftGap {
  table: string;
  /** Null when the whole table is missing or unreachable. */
  column: string | null;
  file: string;
  kind: "missing" | "unreachable";
}

export interface DriftReport {
  gaps: DriftGap[];
  /** Tables whose probe failed for another reason (message kept for admins). */
  errors: { table: string; message: string }[];
  checkedTables: number;
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export function loadExpectedSchema(): ExpectedColumn[] {
  const names = fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
  return expectedSchema(names.map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf-8") })));
}

type ProbeError = { code?: string; message?: string } | null;
const isMissingTable = (e: ProbeError) => e?.code === "PGRST205" || e?.code === "42P01";
const isMissingColumn = (e: ProbeError) => e?.code === "42703" || e?.code === "PGRST204";
const isNoAccess = (e: ProbeError) => e?.code === "42501";

/** One zero-row select per table; per-column only to pin down a missing column. */
export async function checkSchemaDrift(supabase: SupabaseClient, expected = loadExpectedSchema()): Promise<DriftReport> {
  const tables = byTable(expected);
  const results = await Promise.all(
    [...tables].map(async ([table, cols]) => {
      const probe = (select: string) => supabase.from(table).select(select).limit(0);
      const { error } = await probe(cols.map((c) => c.column).join(","));
      if (!error) return { gaps: [] as DriftGap[], errors: [] };
      // The table's own file is the first one that mentions it.
      const tableFile = cols[0].file;
      if (isMissingTable(error)) return { gaps: [{ table, column: null, file: tableFile, kind: "missing" as const }], errors: [] };
      if (isNoAccess(error)) return { gaps: [{ table, column: null, file: tableFile, kind: "unreachable" as const }], errors: [] };
      if (isMissingColumn(error)) {
        const gaps: DriftGap[] = [];
        for (const c of cols) {
          const { error: e } = await probe(c.column);
          if (isMissingColumn(e)) gaps.push({ table, column: c.column, file: c.file, kind: "missing" });
        }
        return { gaps, errors: [] };
      }
      return { gaps: [], errors: [{ table, message: error.message ?? "unknown error" }] };
    })
  );
  return {
    gaps: results.flatMap((r) => r.gaps),
    errors: results.flatMap((r) => r.errors),
    checkedTables: tables.size,
  };
}

/** Gaps grouped by the migration file that would close them, oldest first. */
export function gapsByFile(gaps: DriftGap[]): [string, DriftGap[]][] {
  const map = new Map<string, DriftGap[]>();
  for (const g of gaps) map.set(g.file, [...(map.get(g.file) ?? []), g]);
  return [...map].sort(([a], [b]) => a.localeCompare(b));
}
