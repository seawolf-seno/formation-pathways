import "server-only";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { isSorConfigured, sorAnonKey, sorUrl } from "@/lib/sor/supabase-server";
import { getStaffOrNull } from "@/lib/sor/queries";
import { parseCatalog, type Catalog, type OhPathway } from "./openhouse";

// Open House (Fizzy #38): reading the catalog and the public database
// functions. No session anywhere here: families don't sign in, and every
// read and write is a checked function (20261026000000_open_house.sql).

let catalog: Catalog | null = null;
export function openHouseCatalog(): Catalog {
  catalog ??= parseCatalog(JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "openhouse.json"), "utf-8")));
  return catalog;
}

export function publicClient() {
  return createClient(sorUrl(), sorAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** "open" once leadership opened inquiries; otherwise "test" for signed-in
 *  admissions (fictional sample cards) and "closed" for everyone else. */
export async function ohMode(): Promise<"open" | "test" | "closed"> {
  if (!isSorConfigured()) return "closed";
  const { data } = await publicClient().rpc("inquiries_open");
  if (data === true) return "open";
  const staff = await getStaffOrNull().catch(() => null);
  return staff?.role === "admin" || staff?.role === "admissions" ? "test" : "closed";
}

export interface FeederSchool {
  name: string;
  students: number;
  highlights: string[];
}

export async function feederSchools(): Promise<FeederSchool[]> {
  if (!isSorConfigured()) return [];
  const { data } = await publicClient().rpc("openhouse_school_list");
  return Array.isArray(data) ? (data as FeederSchool[]) : [];
}

export interface FamilyPage {
  childFirstName: string;
  grade: number | null;
  interests: string[];
  currentSchool: string | null;
  pathways: OhPathway[] | null;
  status: "new" | "live" | "pulled";
  usedAi: boolean;
  reviewedBy: string | null;
  shareCode: string;
  shared: boolean;
  waiver: string | null;
  friends: number;
}

const TOKEN = /^[0-9a-f]{64}$/;
const CODE = /^[A-Z0-9]{8}$/;

export async function familyPage(token: string): Promise<FamilyPage | null> {
  if (!TOKEN.test(token) || !isSorConfigured()) return null;
  const { data } = await publicClient().rpc("openhouse_page", { p_token: token });
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    childFirstName: String(d.child_first_name ?? ""),
    grade: typeof d.grade === "number" ? d.grade : null,
    interests: Array.isArray(d.interests) ? (d.interests as string[]) : [],
    currentSchool: typeof d.current_school === "string" ? d.current_school : null,
    pathways: Array.isArray(d.pathways) ? (d.pathways as OhPathway[]) : null,
    status: (d.status as FamilyPage["status"]) ?? "new",
    usedAi: Boolean(d.used_ai),
    reviewedBy: typeof d.reviewed_by_name === "string" ? d.reviewed_by_name : null,
    shareCode: String(d.share_code ?? ""),
    shared: Boolean(d.shared),
    waiver: typeof d.waiver === "string" ? d.waiver : null,
    friends: Number(d.friends ?? 0),
  };
}

export interface SharedCard {
  childFirstName: string;
  pathways: OhPathway[];
  usedAi: boolean;
  reviewedBy: string | null;
  waiver: string | null;
}

export async function sharedCard(code: string): Promise<SharedCard | null> {
  const c = code.toUpperCase();
  if (!CODE.test(c) || !isSorConfigured()) return null;
  const { data } = await publicClient().rpc("openhouse_public", { p_code: c });
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.pathways)) return null;
  return {
    childFirstName: String(d.child_first_name ?? ""),
    pathways: d.pathways as OhPathway[],
    usedAi: Boolean(d.used_ai),
    reviewedBy: typeof d.reviewed_by_name === "string" ? d.reviewed_by_name : null,
    waiver: typeof d.waiver === "string" ? d.waiver : null,
  };
}
