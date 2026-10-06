import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/sor/queries";
import { getSorClient } from "@/lib/sor/supabase-server";
import { summarizeLab, type FormatSummary, type LabDraft, type LabSession } from "@/lib/sor/spark-lab";
import { FORMAT_LABELS } from "@/lib/sor/sparks";

export const metadata = { title: "Spark Lab · Formation Pathways" };

/** Below this many sessions a format's numbers are noise, and the page says so. */
const ENOUGH = 5;

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const one = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const mins = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/**
 * Which Spark format helps teens show us who they are, and which grows the
 * most distinctive pathways. Counts across sessions only: no names, no
 * per-student rows. Admin and admissions (the roles that can read drafts).
 */
export default async function SparkLabPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const samples = (await searchParams).data === "samples";

  const supabase = await getSorClient();
  const [{ data: sparkRows }, { data: draftRows }] = await Promise.all([
    supabase
      .from("student_sparks")
      .select("person_id, created_at, sparks, people!inner(is_sample)")
      .not("sparks->lab", "is", null)
      .eq("people.is_sample", samples),
    supabase.from("pathway_drafts").select("person_id, created_at, pathways"),
  ]);
  const sessions = (sparkRows ?? []) as unknown as LabSession[];
  const summary = summarizeLab(sessions, (draftRows ?? []) as LabDraft[]);
  const sittings = new Set(sessions.map((s) => s.sparks.lab?.labId)).size;
  const students = new Set(sessions.map((s) => s.person_id)).size;

  const rows: { label: string; help: string; value: (f: FormatSummary) => string }[] = [
    { label: "Sessions", help: "Times this format was done.", value: (f) => String(f.sessions) },
    {
      label: "Felt like them",
      help: "\"Did that feel like you?\" Yes / Kind of / Not really.",
      value: (f) => `${f.felt.yes} / ${f.felt.kind_of} / ${f.felt.not_really}`,
    },
    {
      label: "Head to head",
      help: "\"Which felt more like you?\" Chosen / not chosen / same.",
      value: (f) => `${f.preferred} / ${f.notPreferred} / ${f.same}`,
    },
    { label: "Time taken", help: "Median minutes for this format.", value: (f) => mins(f.medianSeconds) },
    { label: "Sparks shared", help: "Answers, interests and creators per session.", value: (f) => one(f.sparks) },
    { label: "Words per answer", help: "Longer answers usually carry more of the teen.", value: (f) => one(f.wordsPerAnswer) },
    {
      label: "Specific details",
      help: "Names, places and numbers in their answers, per session: the raw material for a distinctive pathway.",
      value: (f) => one(f.specificDetails),
    },
    {
      label: "Used in pathways",
      help: "Of sessions drafted afterwards: the share of their sparks that a pathway grew from.",
      value: (f) => (f.drafted ? `${pct(f.usedShare)} (${f.drafted})` : "no drafts yet"),
    },
    {
      label: "Pathways shaped",
      help: "Of the draft's pathways, how many grew from this session (average).",
      value: (f) => one(f.pathwaysShaped),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/pilot" className="text-xs text-[var(--color-ink-muted)] hover:underline">← Pilot</Link>
      <h1 className="mt-2 font-display text-3xl text-[var(--color-navy-ink)]">Spark Lab</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-muted)]">
        Each student does two Spark formats back to back, in rotating order, then says which felt more like them. This compares the
        formats, never the students: counts only, no names.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/pilot/spark-lab"
          className={`rounded-full px-3 py-1 ${!samples ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)]"}`}
        >
          Pilot students
        </Link>
        <Link
          href="/pilot/spark-lab?data=samples"
          className={`rounded-full px-3 py-1 ${samples ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)]"}`}
        >
          Fictional samples (practice runs)
        </Link>
        <span className="text-[var(--color-ink-muted)]">
          · {sittings} sitting{sittings === 1 ? "" : "s"}, {students} student{students === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left">
              <th className="p-3 font-medium text-[var(--color-ink-muted)]">Measure</th>
              {summary.map((f) => (
                <th key={f.format} className="p-3 font-display text-base text-[var(--color-navy-ink)]">
                  {FORMAT_LABELS[f.format]}
                  {f.format === "classic" && <span className="block font-sans text-xs text-[var(--color-ink-muted)]">control</span>}
                  {f.sessions > 0 && f.sessions < ENOUGH && (
                    <span className="block font-sans text-xs font-normal text-[var(--color-ink-muted)]">too few to call yet</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0 align-top">
                <td className="p-3">
                  <span className="font-medium text-[var(--color-navy-ink)]">{r.label}</span>
                  <span className="block text-xs text-[var(--color-ink-muted)]">{r.help}</span>
                </td>
                {summary.map((f) => (
                  <td key={f.format} className="p-3 tabular-nums">{f.sessions ? r.value(f) : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 text-sm text-[var(--color-ink-muted)] sm:grid-cols-2">
        <p>
          <b className="text-[var(--color-navy-ink)]">Reading it.</b> &ldquo;Felt like them&rdquo; and head to head tell you what
          resonates with teens. Specific details and &ldquo;used in pathways&rdquo; tell you what grows distinctive pathways. A
          format can win one and lose the other; that&apos;s worth knowing.
        </p>
        <p>
          <b className="text-[var(--color-navy-ink)]">Fairness.</b> Pairs rotate through every order, so neither format always goes
          first. &ldquo;Used in pathways&rdquo; only counts once a draft is made after the Spark; drafts combine every session, so
          compare it across formats rather than reading it as an absolute.
        </p>
      </div>
    </div>
  );
}
