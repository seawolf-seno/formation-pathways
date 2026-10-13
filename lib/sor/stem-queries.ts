import "server-only";
import { getSorClient } from "./supabase-server";
import type { StemHub, StemStudentView, StemMember, StemWork } from "../stem";

export async function getStemHub(): Promise<StemHub | null> {
  const db = await getSorClient();
  const results = await Promise.all([
    db.from("stem_program").select("*").single(),
    db.from("stem_memberships").select("*").order("created_at", { ascending: false }),
    db.from("stem_work").select("*").order("created_at", { ascending: false }),
    db.from("stem_mentors").select("*").order("name"),
    db.from("stem_opportunities").select("*").order("deadline", { nullsFirst: false }),
  ]);
  if (results.some(r => r.error?.code === "42P01" || r.error?.code === "PGRST205")) return null;
  const failed = results.find(r => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return { program: results[0].data, members: results[1].data, work: results[2].data, mentors: results[3].data, opportunities: results[4].data } as StemHub;
}

export async function getStemStudentView(token: string): Promise<StemStudentView | null> {
  const db = await getSorClient();
  const { data, error } = await db.rpc("stem_student_view", { p_token: token });
  if (error) throw new Error("Your STEM Scholars page is unavailable. Ask your coordinator to check your link.");
  return data as StemStudentView | null;
}

export async function getStemProfile(personId: string) {
  const db = await getSorClient();
  const [member, work, mentors] = await Promise.all([
    db.from("stem_memberships").select("*").eq("person_id", personId).maybeSingle(),
    db.from("stem_work").select("*").eq("person_id", personId).order("created_at", { ascending: false }),
    db.from("stem_mentors").select("name"),
  ]);
  for (const r of [member, work, mentors]) {
    if (r.error && !["42P01", "PGRST205"].includes(r.error.code)) throw new Error(r.error.message);
  }
  return { member: member.data as StemMember | null, work: (work.data ?? []) as StemWork[], mentorNames: (mentors.data ?? []).map(m => String(m.name)) };
}
