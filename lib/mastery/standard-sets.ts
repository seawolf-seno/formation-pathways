import "server-only";
import fs from "fs";
import path from "path";
import { cache } from "react";
import { getSorClient } from "@/lib/sor/supabase-server";
import { tableNotThereYet } from "@/lib/sor/class-reflections";
import { parseMasteryConfig, type MasteryConfig } from "./config";

// Where a course's standards come from: the hub's own copy
// (mastery_standard_sets, edited on /mastery/standards) if there is one,
// otherwise the built-in file in fixtures/mastery/. The files are the
// starting points; the first save in the hub makes the hub's copy, and every
// save after it is kept (mastery_standard_set_versions).

const KEY = /^[a-z0-9-]{1,60}$/;
const FILES = path.join(process.cwd(), "fixtures", "mastery");

/** A built-in file's raw JSON, or null. */
export function fileStandardSet(key: string): Record<string, unknown> | null {
  if (!KEY.test(key)) return null;
  const file = path.join(FILES, `${key}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>) : null;
}

export function fileStandardSetKeys(): string[] {
  return fs.existsSync(FILES) ? fs.readdirSync(FILES).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
}

export interface StandardSetRow {
  key: string;
  config: Record<string, unknown>;
  created_by: string;
  updated_by: string | null;
  updated_at: string;
}

/** The hub's saved copy, or null (none yet, or the table isn't there yet). */
export const savedStandardSet = cache(async (key: string): Promise<StandardSetRow | null> => {
  if (!KEY.test(key)) return null;
  const supabase = await getSorClient();
  const { data, error } = await supabase
    .from("mastery_standard_sets")
    .select("key, config, created_by, updated_by, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error && !tableNotThereYet(error)) throw new Error(error.message);
  return (data as StandardSetRow) ?? null;
});

/** The raw standards for a key: the hub's copy, else the built-in file. */
export async function rawStandardSet(key: string): Promise<{ raw: Record<string, unknown>; saved: StandardSetRow | null } | null> {
  const saved = await savedStandardSet(key);
  if (saved) return { raw: saved.config, saved };
  const file = fileStandardSet(key);
  return file ? { raw: file, saved: null } : null;
}

/** A course's standards, checked. Throws a plain message naming the problem. */
export const getMasteryConfig = cache(async (key: string): Promise<MasteryConfig> => {
  const found = await rawStandardSet(key);
  if (!found) throw new Error(`No standards called "${key}". Add them on /mastery/standards.`);
  return parseMasteryConfig(found.raw);
});

/** Every standard set a new course can use: built-in files and the hub's own. */
export async function listStandardSets(): Promise<{ key: string; title: string; slug: string; saved: StandardSetRow | null; builtIn: boolean; problem: string | null }[]> {
  const supabase = await getSorClient();
  const { data, error } = await supabase.from("mastery_standard_sets").select("key, config, created_by, updated_by, updated_at");
  const rows = error ? [] : ((data ?? []) as StandardSetRow[]);
  const keys = [...new Set([...fileStandardSetKeys(), ...rows.map((r) => r.key)])].sort();
  return keys.map((key) => {
    const saved = rows.find((r) => r.key === key) ?? null;
    const raw = saved?.config ?? fileStandardSet(key);
    try {
      const c = parseMasteryConfig(raw);
      return { key, title: c.title, slug: c.slug, saved, builtIn: fileStandardSet(key) !== null, problem: null };
    } catch (e) {
      return { key, title: key, slug: "", saved, builtIn: fileStandardSet(key) !== null, problem: e instanceof Error ? e.message : String(e) };
    }
  });
}
