import { anonClient, bearer, courseConfig, json, plainError } from "@/lib/mastery/extension-api";
import { describeLink } from "@/lib/mastery/links";

// POST: tag the page the teacher is on for one of their courses, on a
// standard or a whole unit. YouTube videos are checked with oEmbed and join
// the course's videos; anything else its study links.
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return json({ error: "Not connected" }, 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Not JSON" }, 400);
  }
  const s = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
  const course = s("course", 36);
  const where = s("where", 30);
  if (!/^[0-9a-f-]{36}$/.test(course)) return json({ error: "Which course?" }, 400);
  const [type, code] = where.split(":");
  if (!(type === "s" || type === "g") || !/^[A-Za-z0-9.-]{1,20}$/.test(code ?? "")) return json({ error: "Pick the standard or unit it's for." }, 400);

  const supabase = anonClient();
  const ctx = await supabase.rpc("mastery_ext_context", { p_token: token });
  if (!ctx.data) return json({ error: "This connection was revoked or has expired." }, 401);
  const row = (ctx.data as { courses: { id: string; config_key: string; saved_config: unknown }[] }).courses.find((c) => c.id === course);
  if (!row) return json({ error: "That course isn't yours." }, 403);
  const config = courseConfig(row);
  const ok = type === "s" ? config?.groups.some((g) => g.standards.some((x) => x.code === code)) : config?.groups.some((g) => g.code === code);
  if (!ok) return json({ error: "That standard or unit isn't in this course." }, 400);

  try {
    const link = await describeLink(s("url", 500), s("title", 200));
    const { data, error } = await supabase.rpc("mastery_ext_tag", {
      p_token: token,
      p_course: course,
      p: { ...link, standard: type === "s" ? code : null, group: type === "g" ? code : null, note: s("note", 300) || null },
    });
    if (error) return json({ error: plainError(error) }, 400);
    return json({ id: data, kind: link.kind, title: link.title });
  } catch (e) {
    return json({ error: plainError(e) }, 400);
  }
}
