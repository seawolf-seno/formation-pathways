// Open House pathways (Fizzy #38): the catalog the AI picks from, the
// no-AI fallback, and the checks on what the AI returns. Pure; tested in
// tests/openhouse.test.mjs.
//
// Guardrails (seno approved instant, unreviewed pathways for Open House on
// these terms): mentors and projects come ONLY from fixtures/openhouse.json
// (real faculty by name + department; real programs). The AI chooses and
// writes one short "why"; it can't name anyone or anything else. Staff can
// pull or sign any card from the live wall.

export interface Interest {
  id: string;
  label: string;
  departments: string[];
  projects: string[];
  pathTitle: string;
  because: string;
}
export interface Mentor {
  id: string;
  name: string;
  department: string;
}
export interface Project {
  id: string;
  title: string;
  program: string;
  blurb: string;
}
export interface Catalog {
  keyText: string;
  connect: string;
  interests: Interest[];
  mentors: Mentor[];
  projects: Project[];
}

export interface OhPathway {
  title: string;
  why: string;
  mentors: string[]; // mentor ids
  projects: string[]; // project ids
}

export const MAX_INTERESTS = 3;
/** The consent the Open House form shows; stored with each family. */
export const OH_CONSENT_VERSION = "oh-2026-10";

export function parseCatalog(raw: unknown): Catalog {
  const d = raw as Catalog;
  if (!d || !Array.isArray(d.interests) || !Array.isArray(d.mentors) || !Array.isArray(d.projects)) throw new Error("Bad Open House catalog");
  const mentorIds = new Set(d.mentors.map((m) => m.id));
  const projectIds = new Set(d.projects.map((p) => p.id));
  const departments = new Set(d.mentors.map((m) => m.department));
  for (const i of d.interests) {
    for (const p of i.projects) if (!projectIds.has(p)) throw new Error(`Interest ${i.id}: unknown project ${p}`);
    for (const dep of i.departments) if (!departments.has(dep)) throw new Error(`Interest ${i.id}: no mentor in ${dep}`);
  }
  if (mentorIds.size !== d.mentors.length || projectIds.size !== d.projects.length) throw new Error("Duplicate ids in the Open House catalog");
  return d;
}

/** A small stable number from a string, so the same family gets the same
 *  mentors on a reload, and different families get different ones. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Two pathways without AI, from the interests tapped (first two), each
 *  with a mentor from a matching department and two or three projects. */
export function fallbackPathways(catalog: Catalog, interestIds: string[], seed: string): OhPathway[] {
  const chosen = interestIds.map((id) => catalog.interests.find((i) => i.id === id)).filter((i): i is Interest => Boolean(i));
  const picks = chosen.length >= 2 ? chosen.slice(0, 2) : [...chosen, ...catalog.interests.filter((i) => ["helping", "science", "faith"].includes(i.id) && !chosen.includes(i))].slice(0, 2);
  const used = new Set<string>();
  return picks.map((interest, n) => {
    const pool = catalog.mentors.filter((m) => interest.departments.includes(m.department) && !used.has(m.id));
    const mentor = pool.length ? pool[(hash(seed) + n) % pool.length] : catalog.mentors[(hash(seed) + n) % catalog.mentors.length];
    used.add(mentor.id);
    const projects = interest.projects.filter((p) => !used.has(p)).slice(0, 3);
    projects.forEach((p) => used.add(p));
    return {
      title: interest.pathTitle,
      why: `For a student who ${interest.because}: start with ${catalog.projects.find((p) => p.id === projects[0])?.title.toLowerCase() ?? "a project"} and meet ${mentor.name}.`,
      mentors: [mentor.id],
      projects,
    };
  });
}

const BANNED = /\b(guarantee|scholarship|admitted|admission is|gpa|rank|score|best student|gifted)\b/i;

/** The AI's answer → at most two pathways, each kept only if it uses real
 *  catalog mentors (1–2) and projects (2–3) and short, clean words. Any
 *  pathway that fails is replaced from the fallback, so a card always has
 *  two. */
export function checkAiPathways(raw: unknown, catalog: Catalog, fallback: OhPathway[]): { pathways: OhPathway[]; usedAi: boolean } {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { pathways?: unknown }).pathways) ? (raw as { pathways: unknown[] }).pathways : [];
  const mentorIds = new Set(catalog.mentors.map((m) => m.id));
  const projectIds = new Set(catalog.projects.map((p) => p.id));
  const good: OhPathway[] = [];
  for (const p of list) {
    if (good.length >= 2 || !p || typeof p !== "object") continue;
    const x = p as Record<string, unknown>;
    const title = typeof x.title === "string" ? x.title.trim().replace(/\s+/g, " ") : "";
    const why = typeof x.why === "string" ? x.why.trim().replace(/\s+/g, " ") : "";
    const mentors = Array.isArray(x.mentors) ? [...new Set(x.mentors.filter((m): m is string => typeof m === "string" && mentorIds.has(m)))].slice(0, 2) : [];
    const projects = Array.isArray(x.projects) ? [...new Set(x.projects.filter((m): m is string => typeof m === "string" && projectIds.has(m)))].slice(0, 3) : [];
    if (!title || title.length > 60 || !why || why.length > 240 || BANNED.test(title + " " + why) || /https?:|@/.test(why)) continue;
    if (!mentors.length || projects.length < 2) continue;
    if (good.some((g) => g.title.toLowerCase() === title.toLowerCase())) continue;
    good.push({ title, why, mentors, projects });
  }
  const usedAi = good.length > 0;
  while (good.length < 2 && fallback[good.length]) good.push(fallback[good.length]);
  return { pathways: good.slice(0, 2), usedAi };
}

/** Feeder-school line: only when at least 5 students share the school, so
 *  no student can be picked out. */
export const MIN_SCHOOL_COUNT = 5;
export function schoolLine(school: { name: string; students: number; highlights: string[] } | null | undefined): string | null {
  if (!school || school.students < MIN_SCHOOL_COUNT) return null;
  const h = school.highlights.filter(Boolean).slice(0, 3);
  return `${school.students} students from ${school.name} are at Pacifica today${h.length ? `, in ${h.length > 1 ? `${h.slice(0, -1).join(", ")} and ${h.at(-1)}` : h[0]}` : ""}.`;
}

/** What a family's Share sends. The thank-you line appears only while the
 *  fee waiver is on (it's an endorsement for a reward: FTC). */
export function shareMessage(catalog: Catalog, firstName: string, url: string, waiver: string | null): string {
  return [`${firstName}'s Formation Pathway at Pacifica Christian.`, catalog.keyText, waiver ? `(If you apply through our link, Pacifica gives our family: ${waiver}.)` : null, url]
    .filter(Boolean)
    .join("\n");
}
