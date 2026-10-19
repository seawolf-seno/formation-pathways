"use server";

import { draftOpenHousePathways } from "@/lib/claude";
import { Pseudonymizer } from "@/lib/sor/anonymize";
import { MAX_INTERESTS, OH_CONSENT_VERSION, checkAiPathways, fallbackPathways, schoolLine } from "./openhouse";
import { feederSchools, ohMode, openHouseCatalog, publicClient } from "./openhouse-server";
import { getSorClient } from "@/lib/sor/supabase-server";

// Open House (Fizzy #38): the family's one tap, and their one share. No
// sign-in: the database functions check everything.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const plain = (m: string) => m.replace(/^.*?ERROR:\s*/, "").slice(0, 200);

/** Join, then draft the pathway (fast model, catalog only, no names sent),
 *  then save it with the server's key. Returns the family's private link. */
export async function joinOpenHouseAction(formData: FormData): Promise<Result<{ token: string }>> {
  const s = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const catalog = openHouseCatalog();
  const firstName = s("first_name", 40);
  const email = s("email", 200).toLowerCase();
  const interests = formData.getAll("interests").map(String).filter((i) => catalog.interests.some((x) => x.id === i)).slice(0, MAX_INTERESTS);
  const grade = Number(s("grade", 2)) || null;
  const school = s("school", 120) || null;
  if (!firstName) return { ok: false, error: "Add your child's first name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Add an email so we can send your link." };
  if (formData.get("consent") !== "on") return { ok: false, error: "Tick the box so we can follow up." };

  // Closed: only signed-in admissions, in test mode (fictional samples).
  const mode = await ohMode();
  if (mode === "closed") return { ok: false, error: "Open House pathways aren't open yet." };
  const db = mode === "test" ? await getSorClient() : publicClient();
  const joined = await db.rpc("openhouse_join", {
    p: {
      child_first_name: firstName, grade, interests, current_school: school, parent_email: email, consent_contact: true,
      consent_version: OH_CONSENT_VERSION, ref: s("ref", 8) || null, ...(mode === "test" ? { sample: true } : {}),
    },
  });
  if (joined.error || !joined.data) return { ok: false, error: plain(joined.error?.message ?? "Please try again.") };
  const { token } = joined.data as { token: string };

  // The pathway: the AI picks from the catalog only; no names leave.
  const fallback = fallbackPathways(catalog, interests, token);
  const schools = await feederSchools();
  const line = schoolLine(schools.find((x) => x.name === school));
  const anon = new Pseudonymizer({ student: { first: firstName } });
  const payload = anon.scrubDeep({
    grade,
    loves: interests.map((id) => ({ id, label: catalog.interests.find((x) => x.id === id)!.label })),
    school: line,
    catalog: { mentors: catalog.mentors, projects: catalog.projects.map(({ id, title, program }) => ({ id, title, program })) },
  });
  let raw: unknown = null;
  try {
    anon.assertNoNames(JSON.stringify(payload));
    raw = await draftOpenHousePathways(JSON.stringify(payload));
  } catch {
    raw = null;
  }
  const { pathways, usedAi } = checkAiPathways(raw, catalog, fallback);
  const finished = pathways.map((p) => ({ ...p, why: anon.restore(p.why).replace(/\[STUDENT\]/g, firstName) }));
  const saved = await db.rpc("openhouse_set_pathways", { p_token: token, p_key: process.env.OPENHOUSE_KEY ?? "", p: finished, p_used_ai: usedAi });
  if (saved.error) return { ok: false, error: "Your pathway couldn't be saved. Please ask someone at the welcome table." };
  return { ok: true, token };
}

/** A parent or guardian shares; returns the code their link carries. */
export async function shareOpenHouseAction(token: string): Promise<Result<{ code: string }>> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That link isn't right." };
  const { data, error } = await publicClient().rpc("openhouse_share", { p_token: token, p_guardian: true });
  if (error || !data) return { ok: false, error: plain(error?.message ?? "This pathway can't be shared right now.") };
  return { ok: true, code: String(data) };
}
