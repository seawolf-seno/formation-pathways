import { anonClient, bearer, courseConfig, json, plainError, standardsOutline } from "@/lib/mastery/extension-api";

// GET: everything the Mastery Hub extension needs, for the token's teacher
// only: their courses, each course's standards, roster names (to match Khan
// students in the teacher's own browser), Khan links and key skills.
export async function GET(request: Request) {
  const token = bearer(request);
  if (!token) return json({ error: "Not connected" }, 401);
  const { data, error } = await anonClient().rpc("mastery_ext_context", { p_token: token });
  if (error) return json({ error: plainError(error) }, 500);
  if (!data) return json({ error: "This connection was revoked or has expired. Connect again from /mastery." }, 401);
  const d = data as { staff: string; courses: Record<string, unknown>[] };
  return json({
    staff: d.staff,
    courses: d.courses.map((c) => {
      const config = courseConfig(c as { config_key: string; saved_config: unknown });
      const { saved_config: _drop, ...rest } = c;
      void _drop;
      return { ...rest, standards: config ? standardsOutline(config) : [] };
    }),
  });
}
