import { anonClient, bearer, json, plainError } from "@/lib/mastery/extension-api";

const ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const UUID = /^[0-9a-f-]{36}$/;

// POST: one Khan Academy sync for one course, from the extension. The body
// holds the skill catalog (titles, Khan units), Khan-student links the
// teacher's browser matched to roster students, and every level for those
// students only. The database keeps every level, and adds evidence for
// skills sorted into an objective at proficient or mastered.
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return json({ error: "Not connected" }, 401);
  let body: { course?: unknown; skills?: unknown; links?: unknown; levels?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Not JSON" }, 400);
  }
  if (typeof body.course !== "string" || !UUID.test(body.course)) return json({ error: "Which course?" }, 400);
  const arr = (v: unknown, max: number) => (Array.isArray(v) && v.length <= max ? v : null);
  const skills = arr(body.skills, 3000)?.flatMap((s) => {
    const x = s as Record<string, unknown>;
    return typeof x.id === "string" && ID.test(x.id) && typeof x.title === "string" && x.title.trim()
      ? [{
          id: x.id,
          title: x.title.slice(0, 200),
          unit: typeof x.unit === "string" ? x.unit.slice(0, 200) : "",
          unitNumber: Number.isInteger(x.unitNumber) && (x.unitNumber as number) >= 1 && (x.unitNumber as number) <= 99 ? x.unitNumber : null,
        }]
      : [];
  });
  const links = arr(body.links, 500)?.flatMap((l) => {
    const x = l as Record<string, unknown>;
    return typeof x.kaid === "string" && /^[A-Za-z0-9_:.-]{4,80}$/.test(x.kaid) && typeof x.person === "string" && UUID.test(x.person) ? [{ kaid: x.kaid, person: x.person }] : [];
  });
  // Every Khan level word is kept; only proficient and mastered count.
  const levels = arr(body.levels, 60000)?.flatMap((v) => {
    const x = v as Record<string, unknown>;
    const level = typeof x.level === "string" ? x.level.toLowerCase().trim() : "";
    return typeof x.person === "string" && UUID.test(x.person) && typeof x.skill === "string" && ID.test(x.skill) && /^[a-z_ -]{1,30}$/.test(level)
      ? [{ person: x.person, skill: x.skill, level }]
      : [];
  });
  if (!skills || !links || !levels) return json({ error: "That sync doesn't look right" }, 400);
  const { data, error } = await anonClient().rpc("mastery_ext_khan_sync", { p_token: token, p_course: body.course, p: { skills, links, levels } });
  if (error) return json({ error: plainError(error) }, /connected|revoked/.test(error.message) ? 401 : 400);
  return json(data);
}
