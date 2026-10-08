// Pathway quality check on FICTIONAL sample students only (fixtures/sample).
// Builds each student's drafting input the same way the app does, runs both
// generators (applicant + current student), and writes a markdown report with
// every pathway plus cross-student checks for the "too generic" problem.
//
// No database, no real students. Needs ANTHROPIC_API_KEY in .env.local (without
// it every draft is the canned fallback, which the report flags).
//
// Run: npm run eval:pathways   (report lands in reports/, which is git-ignored)
import fs from "fs";
import path from "path";
import { draftAdmissionsPathways, draftRuakhPathways, type RuakhInput } from "../lib/claude";
import { Pseudonymizer } from "../lib/sor/anonymize";
import { audienceForStage, PATHWAY_PLAN } from "../lib/types";
import { getWorldSignals } from "../lib/world-signals";
import type { GeneratedPathway } from "../lib/types";

const root = process.cwd();
const fixture = (name: string) => fs.readFileSync(path.join(root, "fixtures/sample", name), "utf-8");

// .env.local, without a dependency (next loads it for the app, not for scripts).
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf-8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Minimal CSV: quoted fields, commas inside quotes, no embedded newlines. */
function parseCsv(text: string): Record<string, string>[] {
  const rows = text.trim().split("\n").map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

type Person = { first_name: string; last_name: string; preferred_name?: string; stage: string; current_grade?: number; ids: Record<string, string> };
const roster = JSON.parse(fixture("pilot-roster.json")).people as Person[];
const finalsite = parseCsv(fixture("finalsite-applicants.csv"));
const blackbaud = JSON.parse(fixture("blackbaud-users.json")).users as {
  id: string;
  student_info: { grade_level?: number };
  sections?: { school_year: string; course_title: string; offering_type?: { description?: string } }[];
}[];
const canvas = JSON.parse(fixture("canvas-courses.json")).courses as {
  name: string;
  teacher: string;
  submissions: { user_id: string; assignment: string; comment: string | null }[];
}[];

// One fictional Spark per enrolled student, so the eval exercises the sparks path too.
const SPARKS: Record<string, string> = {
  Mateo: [
    `- Asked "I could teach a 10-minute class on…", they said: "How to fix a bike derailleur without the right tools (For example: my neighbor's 1980s Peugeot)"`,
    `- Things they're obsessed with: Restoring old things so they work again, Flying drones or building robots`,
    `- YouTube channels they chose to share: Park Tool, Stuff Made Here`,
  ].join("\n"),
  Iris: [
    `- Asked "A problem (at school or in the world) that really bugs me is…", they said: "How nobody at my old school knew the names of the custodians."`,
    `- Things they're obsessed with: Writing stories, poems or fan fiction, Listening when a friend is going through it`,
    `- How they lean: Small group (over Big crowd)`,
  ].join("\n"),
};

function ruakhInputFor(p: Person): RuakhInput {
  const fs_ = finalsite.find((r) => r["Person ID"] === p.ids.finalsite);
  const bb = blackbaud.find((u) => u.id === p.ids.blackbaud);
  const first = p.preferred_name || p.first_name;
  const questions = fs_ ? Object.keys(fs_).filter((k) => k.startsWith("Q: ")) : [];
  return {
    firstName: first,
    stage: p.stage,
    grade: bb?.student_info.grade_level ?? p.current_grade ?? null,
    previousSchool: fs_?.["Current School"] || null,
    interests: fs_ ? fs_["Interests"].split(";").map((s) => s.trim()).filter(Boolean) : [],
    activities: fs_ ? fs_["Activities"].split(";").map((s) => s.trim()).filter(Boolean) : [],
    applicationResponses: questions.map((q) => ({ question: q.slice(3), answer: fs_![q] })).filter((a) => a.answer),
    courses: (bb?.sections ?? []).map((s) => ({
      name: `${s.course_title} (${s.school_year}${s.offering_type?.description ? `, ${s.offering_type.description}` : ""})`,
      teacher: null,
    })),
    teacherComments: canvas.flatMap((c) =>
      c.submissions
        .filter((s) => s.user_id === p.ids.canvas && s.comment)
        .map((s) => ({ course: c.name, assignment: s.assignment, comment: s.comment! }))
    ),
    observations: [],
    studentSparks: SPARKS[first] ?? null,
  };
}

// ---- checks for "too generic"
const STOP = new Set("the and for with your from into of a an to in on at".split(" "));
const nameWords = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
function checks(all: { student: string; pathways: GeneratedPathway[]; courses: string[] }[]) {
  const lines: string[] = [];
  const byWord = new Map<string, Set<string>>();
  for (const s of all) for (const p of s.pathways) for (const w of nameWords(p.name)) (byWord.get(w) ?? byWord.set(w, new Set()).get(w)!).add(s.student);
  const shared = [...byWord].filter(([, who]) => who.size >= 3).map(([w, who]) => `"${w}" (${who.size} students)`);
  lines.push(`- Words in pathway names shared by 3+ students: ${shared.length ? shared.join(", ") : "none"}`);
  const courseNamed = all.flatMap((s) =>
    s.pathways
      .filter((p) => s.courses.some((c) => nameWords(c.replace(/\(.*\)/, "")).some((w) => w.length > 4 && nameWords(p.name).includes(w))))
      .map((p) => `${s.student}: "${p.name}"`)
  );
  lines.push(`- Pathway names that echo a course title: ${courseNamed.length ? courseNamed.join("; ") : "none"}`);
  const total = all.reduce((n, s) => n + s.pathways.length, 0);
  const hooks = all.reduce((n, s) => n + s.pathways.filter((p) => p.hook).length, 0);
  const whyNow = all.reduce((n, s) => n + s.pathways.filter((p) => p.whyNow).length, 0);
  lines.push(`- Pathways: ${total}; with a hook: ${hooks}; with a "why now": ${whyNow}`);
  const maxWhy = Math.max(0, ...all.map((s) => s.pathways.filter((p) => p.whyNow).length));
  lines.push(`- Most "why now" lines in one draft: ${maxWhy}`);

  // Glimpses: how they open, and whether they lean on a weekday.
  const glimpses = all.flatMap((s) => s.pathways.map((p) => p.glimpse ?? "")).filter(Boolean);
  const openers = glimpses.map((g) => g.split(/\s+/).slice(0, 2).join(" ").toLowerCase().replace(/[^a-z' ]/g, ""));
  const weekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  lines.push(
    `- Glimpses: ${glimpses.length}; distinct two-word openings: ${new Set(openers).size}; ` +
      `open with "Picture"/"Imagine": ${glimpses.filter((g) => /^(picture|imagine)\b/i.test(g)).length}; ` +
      `name a weekday: ${glimpses.filter((g) => weekday.test(g)).length}; ` +
      `open with a time of day: ${glimpses.filter((g) => /^(late|early|mid|it'?s (the )?(end|start|middle))\b|^(morning|afternoon|evening|lunch|dawn|dusk)\b/i.test(g)).length}`
  );
  const common = [...openers.reduce((m, o) => m.set(o, (m.get(o) ?? 0) + 1), new Map<string, number>())]
    .filter(([, n]) => n >= 3)
    .map(([o, n]) => `"${o}" ×${n}`);
  lines.push(`- Glimpse openings used 3+ times: ${common.length ? common.join(", ") : "none"}`);

  // Style: the patterns prompts/unique-pathways.txt bans.
  const text = all
    .flatMap((s) => s.pathways.flatMap((p) => [p.name, p.firstSemester, p.stretchChallenge, p.glimpse ?? "", p.whyNow ?? "", ...(p.milestones ?? []).map((m) => m.detail)]))
    .join("\n");
  const SLOP: [string, RegExp][] = [
    ["not just", /\bnot just\b/gi],
    ["it's not / isn't … it's", /\b(it'?s not|isn'?t)\b[^.]{0,60}\bit'?s\b/gi],
    ["not X but Y", /\bnot [a-z]+(?: [a-z]+){0,4},? but\b/gi],
    ["exactly the / exactly what", /\bexactly (the|what)\b/gi],
    ["right now", /\bright now\b/gi],
    ["more than ever", /\bmore than ever\b/gi],
    ["journey/tapestry/testament/delve/unlock/embark/thrive/navigate/landscape", /\b(journey|tapestry|testament|delve|unlock\w*|embark\w*|thrive\w*|navigat\w*|landscape)\b/gi],
  ];
  const hits = SLOP.map(([label, re]) => [label, text.match(re)?.length ?? 0] as const);
  lines.push(`- Em dashes: ${(text.match(/—/g) ?? []).length}`);
  lines.push(`- Banned phrasing: ${hits.map(([l, n]) => `${l} ${n}`).join("; ")}`);
  return lines;
}

function render(p: GeneratedPathway, i: number): string {
  return [
    `#### ${i + 1}. ${p.name}`,
    p.hook ? `*Grows from:* "${p.hook}"` : `*Grows from:* (none)`,
    p.whyNow ? `*Why now:* ${p.whyNow} — ${p.whyNowSource}` : "",
    "",
    p.firstSemester,
    "",
    `- Stretch: ${p.stretchChallenge}`,
    `- Mentor: ${p.mentorArchetype}`,
    ...(p.milestones ?? []).map((m) => `- ${m.when}: **${m.title}**: ${m.detail}${m.spark ? ` ✦ ${m.spark}` : ""}`),
    p.glimpse ? `\n> ${p.glimpse}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function main() {
  const live = Boolean(process.env.ANTHROPIC_API_KEY);
  const world = await getWorldSignals();
  const out: string[] = [
    `# Pathway eval, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Fictional sample students only. Model: ${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"}. ` +
      `${live ? "Live Claude." : "**No ANTHROPIC_API_KEY: every draft below is the canned fallback.**"} ` +
      `World signals: ${world.signals.length} (${world.origin}, ${world.fetchedAt.slice(0, 10)}).`,
  ];
  const all: { student: string; pathways: GeneratedPathway[]; courses: string[] }[] = [];

  for (const p of roster) {
    const input = ruakhInputFor(p);
    const started = Date.now();
    // Drafted exactly as the live app drafts: names out, then back in.
    const anon = new Pseudonymizer({
      student: { first: p.first_name, last: p.last_name, preferred: p.preferred_name },
      others: roster.filter((o) => o !== p).map((o) => ({ first: o.first_name, last: o.last_name, preferred: o.preferred_name })),
    });
    const sent = { ...anon.scrubDeep(input), firstName: "[STUDENT]" };
    anon.assertNoNames(JSON.stringify(sent));
    // Same counts as the app: three for an applicant, six for a current student.
    const draft = anon.restoreDeep(await draftRuakhPathways(sent, PATHWAY_PLAN[audienceForStage(p.stage)].draft));
    const unrestored = JSON.stringify(draft.pathways).match(/\[(?:STUDENT|FAMILY|PARENT|PERSON|STAFF)[^\]]*\]?/gi) ?? [];
    if (unrestored.length) console.log(`${input.firstName}: ${unrestored.length} placeholder(s) the model mangled: ${unrestored.slice(0, 3).join(", ")}`);
    const secs = Math.round((Date.now() - started) / 1000);
    all.push({ student: input.firstName, pathways: draft.pathways, courses: input.courses.map((c) => c.name) });
    out.push(
      "",
      `## ${input.firstName} (${p.stage}${input.grade ? `, grade ${input.grade}` : ""})${draft.usedFallback ? " — FALLBACK" : ""}`,
      `Input: ${input.applicationResponses.length} answers, ${input.courses.length} courses, ${input.teacherComments.length} teacher comments, ` +
        `${input.studentSparks ? "sparks" : "no sparks"}; ${secs}s.`,
      "",
      `**Portrait:** ${draft.portrait}`,
      "",
      ...draft.pathways.map((pw, i) => render(pw, i) + "\n")
    );
    console.log(`${input.firstName}: ${draft.pathways.length} pathways${draft.usedFallback ? " (fallback)" : ""}, ${secs}s`);
  }

  // The applicant generator, on the applicants' essay answers.
  for (const row of finalsite.filter((r) => roster.find((p) => p.ids.finalsite === r["Person ID"])?.stage !== "enrolled")) {
    const answers = Object.keys(row)
      .filter((k) => k.startsWith("Q: ") && row[k])
      .map((k) => ({ question: k.slice(3), answer: row[k] }));
    const first = row["Preferred Name"] || row["First Name"];
    const { result, usedFallback } = await draftAdmissionsPathways(answers);
    all.push({ student: `${first} (applicant view)`, pathways: result.pathways, courses: [] });
    out.push("", `## ${first}: applicant generator${usedFallback ? " — FALLBACK" : ""}`, "", ...result.pathways.map((pw, i) => render(pw, i) + "\n"));
    console.log(`${first} (applicant): ${result.pathways.length} pathways${usedFallback ? " (fallback)" : ""}`);
  }

  out.splice(3, 0, "", "## Checks across students", ...checks(all));
  fs.mkdirSync("reports", { recursive: true });
  const file = path.join("reports", `pathway-eval-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  fs.writeFileSync(file, out.join("\n") + "\n");
  console.log(`\nReport: ${file}`);
}

main();
