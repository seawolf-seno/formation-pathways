import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sorAnonKey, sorUrl } from "@/lib/sor/supabase-server";
import { allStandards, parseMasteryConfig, type MasteryConfig } from "./config";
import { standardsByName } from "./exports";
import { fileStandardSet } from "./standard-sets";

// Shared by the browser extension's routes (app/api/mastery/extension/*).
// No session: the extension's token is the credential, and every database
// call is a token-checked function (20261022000000_mastery_extension.sql).

const TOKEN = /^fpx_[A-Za-z0-9_-]{30,80}$/;

export function bearer(request: Request): string | null {
  const t = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  return TOKEN.test(t) ? t : null;
}

/** The publishable-key client, with no session and nothing persisted. */
export function anonClient() {
  return createClient(sorUrl(), sorAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const plainError = (e: unknown) => {
  const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return m.replace(/^.*?ERROR:\s*/, "").slice(0, 300);
};

/** A course's standards from the context row: the hub's copy, else the file. */
export function courseConfig(row: { config_key: string; saved_config: unknown }): MasteryConfig | null {
  try {
    return parseMasteryConfig(row.saved_config ?? fileStandardSet(row.config_key));
  } catch {
    return null;
  }
}

/** What the extension shows for tagging, and suggests for Khan skills. */
export function standardsOutline(config: MasteryConfig) {
  return config.groups.map((g) => ({
    code: g.code,
    title: g.title,
    unitNumber: g.unitNumber,
    standards: g.standards.map((s) => ({ code: s.code, title: s.title })),
  }));
}

/** Suggested standard for a Khan skill title (the hub's name matching). */
export function suggestStandard(config: MasteryConfig, title: string): string | null {
  const hits = standardsByName(title, config);
  return hits.length === 1 ? hits[0] : null;
}

export { allStandards };
