import "server-only";
import { after, connection } from "next/server";
import { replaceDemoDb, serializeDemoDb } from "./db";
import { getSorClient, isSorConfigured } from "./sor/supabase-server";

/**
 * Keeps the fictional demo's SQLite database the same on every server
 * instance. On Vercel each instance has its own /tmp copy, so a share link,
 * approval or capture made on one could 404 on another. Now:
 *
 *   - before a demo page renders or a demo action runs: compare this
 *     instance's snapshot version with Supabase's `demo_snapshots` row (one
 *     tiny query) and, if Supabase is newer, load that copy;
 *   - after a demo action writes: upload the whole serialized database
 *     (~300 KB) as the next version.
 *
 * Reads and writes go through the signed-in staff member's session, so RLS
 * decides: active staff only. A visitor who isn't signed in (a family opening
 * a share link on their own phone) still sees this instance's copy only.
 * Last writer wins, which is fine for a demo with a handful of users.
 *
 * On by default on Vercel; DEMO_PERSIST=on enables it locally, =off disables
 * it anywhere. Any failure (table not created yet, no session, network)
 * leaves the instance on its local copy: the demo never breaks over this.
 *
 * FICTIONAL DATA ONLY: this is the demo's invented data, never the system of
 * record's.
 */

declare global {
  var __demoSnapshotVersion: number | undefined;
  var __demoPersistWarned: boolean | undefined;
}

function enabled(): boolean {
  const flag = process.env.DEMO_PERSIST?.trim();
  if (flag === "off") return false;
  return (flag === "on" || Boolean(process.env.VERCEL)) && isSorConfigured();
}

function warnOnce(what: string, e: unknown) {
  if (global.__demoPersistWarned) return;
  global.__demoPersistWarned = true;
  console.warn(`[demo-persist] ${what}; staying on this instance's copy.`, e instanceof Error ? e.message : e);
}

const localVersion = () => global.__demoSnapshotVersion ?? 0;

/** Load Supabase's demo snapshot if it's newer than this instance's. */
export async function syncDemoDb(): Promise<void> {
  if (!enabled()) return;
  // Request-time, never prerendered: outside the try so Next sees it.
  await connection();
  try {
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("demo_snapshots").select("version").eq("id", 1).maybeSingle();
    if (error) return warnOnce("can't read demo_snapshots", error);
    if (!data || Number(data.version) <= localVersion()) return; // none yet, not staff, or up to date
    const { data: row, error: e2 } = await supabase.from("demo_snapshots").select("version, db").eq("id", 1).single();
    if (e2 || !row) return warnOnce("can't load the demo snapshot", e2);
    replaceDemoDb(Buffer.from(row.db as string, "base64"));
    global.__demoSnapshotVersion = Number(row.version);
  } catch (e) {
    warnOnce("sync failed", e);
  }
}

/** Upload this instance's demo database as the next version. */
export async function persistDemoDb(): Promise<void> {
  if (!enabled()) return;
  try {
    const supabase = await getSorClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return; // not signed in: RLS would refuse anyway
    const { data: remote } = await supabase.from("demo_snapshots").select("version").eq("id", 1).maybeSingle();
    const next = Math.max(localVersion(), Number(remote?.version ?? 0)) + 1;
    const { error } = await supabase.from("demo_snapshots").upsert({
      id: 1,
      version: next,
      db: serializeDemoDb().toString("base64"),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) return warnOnce("can't save the demo snapshot", error);
    global.__demoSnapshotVersion = next;
  } catch (e) {
    warnOnce("save failed", e);
  }
}

/** For a demo Server Action that writes: catch up first, save once it's done
 *  (after the response, so the action isn't slowed down). */
export async function demoWrite(): Promise<void> {
  await syncDemoDb();
  if (enabled()) after(persistDemoDb);
}
