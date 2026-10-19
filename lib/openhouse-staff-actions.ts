"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/sor/queries";
import { getSorClient } from "@/lib/sor/supabase-server";

// The Open House live wall (admin and admissions; RLS and the guard trigger
// decide). Signing and waiving are stamped with the signed-in staff name.

type Result = { ok: true } | { ok: false; error: string };
const msg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e)).slice(0, 200);

async function staffUpdate(id: string, patch: Record<string, unknown>): Promise<Result> {
  try {
    const staff = await requireStaff();
    if (staff.role !== "admin" && staff.role !== "admissions") return { ok: false, error: "Admissions or admin only." };
    const supabase = await getSorClient();
    const { error } = await supabase.from("openhouse_families").update(patch).eq("id", id);
    if (error) return { ok: false, error: msg(error) };
    revalidatePath("/pilot/openhouse");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function signCardAction(id: string) {
  return staffUpdate(id, { reviewed_at: new Date().toISOString() });
}
export async function pullCardAction(id: string, pulled: boolean) {
  return staffUpdate(id, { status: pulled ? "pulled" : "live" });
}
export async function markAppliedAction(id: string, applied: boolean) {
  return staffUpdate(id, { applied });
}
export async function waiveFeeAction(id: string) {
  return staffUpdate(id, { fee_waived_at: new Date().toISOString() });
}

export async function saveSchoolAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireStaff();
    if (staff.role !== "admin" && staff.role !== "admissions") return { ok: false, error: "Admissions or admin only." };
    const name = String(formData.get("name") ?? "").trim().slice(0, 120);
    const students = Number(formData.get("students"));
    const highlights = String(formData.get("highlights") ?? "").split(",").map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (name.length < 2 || !Number.isInteger(students) || students < 0) return { ok: false, error: "A school name and a number of students." };
    const supabase = await getSorClient();
    const { error } = await supabase.from("openhouse_schools").upsert({ name, students, highlights, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: msg(error) };
    revalidatePath("/pilot/openhouse");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function deleteSchoolAction(name: string): Promise<Result> {
  try {
    await requireStaff();
    const supabase = await getSorClient();
    const { error } = await supabase.from("openhouse_schools").delete().eq("name", name);
    if (error) return { ok: false, error: msg(error) };
    revalidatePath("/pilot/openhouse");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
