"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSorClient } from "@/lib/sor/supabase-server";
import { COURSE_SLUG, parseMasteryConfig, youtubeId } from "./config";
import { requireMasteryTeacher } from "./queries";
import { fileStandardSet, savedStandardSet } from "./standard-sets";

// Editing standard sets in the hub (/mastery/standards). Every save is
// checked by the same parser that reads the built-in files, so a broken set
// is refused with the reason instead of breaking a course page.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const message = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

function refresh(key: string) {
  revalidatePath("/mastery", "layout");
  revalidatePath("/me", "layout");
  revalidatePath(`/mastery/standards/${key}`);
}

/** Save a whole standard set. The first save of a built-in set makes the
 *  hub's copy (owned by whoever saved it); later saves need that owner or
 *  an admin (RLS). */
export async function saveStandardSetAction(key: string, json: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    if (json.length > 400_000) return { ok: false, error: "That's too big to save (400 KB at most)." };
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, error: "That isn't valid JSON." };
    }
    const config = parseMasteryConfig(raw);
    if (config.key !== key) return { ok: false, error: `The key must stay "${key}".` };
    const supabase = await getSorClient();
    const existing = await savedStandardSet(key);
    if (existing) {
      const { data, error } = await supabase.from("mastery_standard_sets").update({ config: raw }).eq("key", key).select("key");
      if (error) throw new Error(error.message);
      if (!data?.length) return { ok: false, error: "Only the teacher who first saved these standards (or an admin) can change them." };
    } else {
      const { error } = await supabase.from("mastery_standard_sets").insert({ key, config: raw });
      if (error) throw new Error(error.message);
    }
    refresh(key);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** A new subject from a small template: one unit, one standard, the usual
 *  four levels and rules. */
export async function createStandardSetAction(formData: FormData): Promise<Result> {
  let key: string;
  try {
    await requireMasteryTeacher();
    const title = String(formData.get("title") ?? "").trim().slice(0, 120);
    if (!title) return { ok: false, error: "Name the subject." };
    key = String(formData.get("key") ?? "").trim().toLowerCase() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    if (!/^[a-z0-9-]{1,60}$/.test(key)) return { ok: false, error: "The key is lowercase letters, numbers and dashes." };
    const slug = String(formData.get("slug") ?? "").trim() || title.replace(/[^A-Za-z0-9]+/g, "").slice(0, 40);
    if (!COURSE_SLUG.test(slug)) return { ok: false, error: "The course address is letters, numbers and dashes, starting with a letter." };
    if (fileStandardSet(key) || (await savedStandardSet(key))) return { ok: false, error: `There's already a standard set called "${key}".` };
    const base = fileStandardSet("ap-physics-1") as { scale: unknown; rules: Record<string, unknown> } | null;
    const raw = {
      key,
      slug,
      title,
      scale: base?.scale,
      rules: base?.rules,
      groups: [{ code: "U1", title: "Unit 1", unitNumber: 1, resources: [], videos: [], standards: [{ code: "1.1", title: "First standard", aliases: [], resources: [], videos: [] }] }],
    };
    parseMasteryConfig(raw);
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_standard_sets").insert({ key, config: raw });
    if (error) throw new Error(error.message);
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  redirect(`/mastery/standards/${key}`);
}

/** A YouTube link → its id, title and channel, from YouTube's own oEmbed
 *  (the same check every built-in video went through). */
export async function lookupVideoAction(input: string): Promise<Result<{ id: string; title: string; channel: string }>> {
  try {
    await requireMasteryTeacher();
    const id = youtubeId(input);
    if (!id) return { ok: false, error: "That isn't a YouTube video link." };
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: "YouTube doesn't know that video (private, removed, or a typo)." };
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title || !data.author_name) return { ok: false, error: "YouTube didn't return a title for that video." };
    return { ok: true, id, title: data.title.slice(0, 200), channel: data.author_name.slice(0, 100) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Put an earlier version back (saved as a new version; nothing is lost). */
export async function restoreStandardSetAction(key: string, versionId: number): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { data } = await supabase.from("mastery_standard_set_versions").select("config").eq("id", versionId).eq("key", key).maybeSingle();
    if (!data) return { ok: false, error: "That version is gone." };
    return saveStandardSetAction(key, JSON.stringify(data.config));
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
