import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findCourse, getCourseBundle, requireMasteryTeacher } from "@/lib/mastery/queries";
import { syncCanvasIfDue } from "@/lib/mastery/sync";
import { displayName } from "@/lib/sor/types";
import { ObjectiveCard, objectiveLevel } from "@/components/mastery/ObjectiveCard";
import { LEVEL_STYLE } from "@/components/mastery/levels";
import { CanvasControls } from "@/components/mastery/TeacherTools";

export const metadata = { title: "Mastery Hub · Formation Pathways", robots: { index: false, follow: false } };

/**
 * A course's dashboard, students first: the class down the left (a dot per
 * learning objective in the unit), and the chosen student's objectives
 * filling the page. Each objective shows the Canvas score first and opens
 * into everything behind it: every Khan skill sorted into it with the
 * student's level, AP Classroom results, Canvas work, oral exams.
 * Everything else about the course is on Setup.
 */
export default async function CourseDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ unit?: string; student?: string }>;
}) {
  const staff = await requireMasteryTeacher();
  const { course: address } = await params;
  const { unit, student } = await searchParams;
  const found = await findCourse(address);
  if (!found) notFound();
  if (found.slug !== decodeURIComponent(address)) redirect(`/mastery/${found.slug}`);
  let bundle = await getCourseBundle(found);
  if (!bundle) notFound();
  // A real course with Canvas connected checks it on opening (at most every six hours).
  const canvasNote = await syncCanvasIfDue(bundle, staff.user_id);
  if (canvasNote) bundle = (await getCourseBundle(found)) ?? bundle;
  const { course, config, roster, evidence, requests, grades, khanSkills, khanLevels } = bundle;

  // The unit: asked for, else the last one the class finished, else the
  // newest one with evidence, else the first.
  const newest = [...evidence].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const group =
    config.groups.find((g) => g.code === unit) ??
    config.groups.find((g) => course.finished_through != null && g.unitNumber === course.finished_through) ??
    config.groups.find((g) => newest && g.standards.some((s) => s.code === newest.standard_code)) ??
    config.groups[0];
  const selected = roster.find((s) => s.id === student) ?? roster[0] ?? null;
  const waiting = requests.filter((r) => r.status === "open" || r.status === "scheduled");
  const href = (q: { unit?: string; student?: string }) => {
    const p = new URLSearchParams();
    p.set("unit", q.unit ?? group.code);
    if (q.student ?? selected?.id) p.set("student", (q.student ?? selected?.id)!);
    return `/mastery/${course.slug}?${p}`;
  };
  const gradeOf = (personId: string, code: string) => grades.find((g) => g.person_id === personId && g.standard_code === code) ?? null;
  const evidenceOf = (personId: string, code: string) => evidence.filter((e) => e.person_id === personId && e.standard_code === code);
  const unsorted = khanSkills.filter((k) => !k.standard_code && (k.unit_number == null || k.unit_number === group.unitNumber)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/mastery" className="text-xs text-[var(--color-ink-muted)] underline">
            Mastery Hub
          </Link>
          <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">{course.title}</h1>
          {course.is_sample && <p className="text-xs uppercase tracking-wider text-[var(--color-gold)]">Fictional sample</p>}
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          {waiting.length > 0 && (
            <Link href={`/mastery/${course.slug}/setup#requests`} className="rounded-xl bg-[var(--color-gold-light)] px-3 py-2 text-[var(--color-navy-ink)]">
              {waiting.length} request{waiting.length === 1 ? "" : "s"}
            </Link>
          )}
          <Link href={`/mastery/${course.slug}/oral${selected ? `?student=${selected.id}` : ""}`} className="rounded-xl bg-[var(--color-navy)] px-3 py-2 font-medium text-white">
            Oral exam
          </Link>
          <Link href={`/mastery/${course.slug}/setup`} className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-navy-ink)]">
            Setup
          </Link>
          <Link href={`/mastery/${course.slug}/log`} className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-navy-ink)]">
            Log
          </Link>
        </nav>
      </header>

      <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1 text-xs" aria-label="Units">
        {config.groups.map((g) => (
          <Link
            key={g.code}
            href={href({ unit: g.code })}
            className={`shrink-0 rounded-full px-3 py-1 ${g.code === group.code ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)] bg-white text-[var(--color-navy-ink)]"}`}
          >
            {g.title}
          </Link>
        ))}
      </nav>

      {!roster.length ? (
        <p className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-ink-muted)]">
          No students yet. Add them on <Link href={`/mastery/${course.slug}/setup`} className="underline">Setup</Link>.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
          <aside className="rounded-2xl border border-[var(--color-border)] bg-white">
            <p className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              {roster.length} student{roster.length === 1 ? "" : "s"} · {group.standards.length} objective{group.standards.length === 1 ? "" : "s"}
            </p>
            <ul className="max-h-[70vh] overflow-y-auto">
              {roster.map((s) => (
                <li key={s.id}>
                  <Link
                    href={href({ student: s.id })}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${s.id === selected?.id ? "bg-[var(--color-pacific-light)] font-medium text-[var(--color-navy-ink)]" : "text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"}`}
                  >
                    <span className="min-w-0 truncate">{displayName(s)}</span>
                    <span className="flex shrink-0 gap-1" aria-hidden>
                      {group.standards.map((st) => {
                        const level = objectiveLevel(config, gradeOf(s.id, st.code), evidenceOf(s.id, st.code));
                        return <span key={st.code} title={st.title} className={`h-3 w-3 rounded-full ${LEVEL_STYLE[level ?? "none"].cell} ${level ? "" : "border border-[var(--color-border)]"}`} />;
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          {selected && (
            <section aria-label={displayName(selected)} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl text-[var(--color-navy-ink)]">{displayName(selected)}</h2>
                <span className="flex flex-wrap gap-3 text-xs">
                  <Link href={`/mastery/${course.slug}/students/${selected.id}`} className="text-[var(--color-navy)] underline">
                    Full page &amp; next steps
                  </Link>
                  <Link href={`/mastery/${course.slug}/oral?student=${selected.id}`} className="text-[var(--color-navy)] underline">
                    Give an oral exam
                  </Link>
                </span>
              </div>
              <p className="text-sm text-[var(--color-ink-muted)]">{group.title}</p>
              {group.standards.map((st, i) => (
                <ObjectiveCard
                  key={st.code}
                  config={config}
                  standard={st}
                  evidence={evidenceOf(selected.id, st.code)}
                  grade={gradeOf(selected.id, st.code)}
                  khanSkills={khanSkills.filter((k) => k.standard_code === st.code)}
                  khanLevels={khanLevels.filter((k) => k.person_id === selected.id)}
                  courseIdForTeacher={course.id}
                  open={i === 0}
                />
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-[var(--color-ink-muted)]">
                {unsorted > 0 && (
                  <Link href={`/mastery/${course.slug}/setup#khan`} className="rounded-lg bg-[var(--color-gold-light)] px-2 py-1 text-[var(--color-navy-ink)]">
                    {unsorted} Khan skill{unsorted === 1 ? "" : "s"} not sorted into an objective yet
                  </Link>
                )}
                {canvasNote && <span>Canvas: {canvasNote}</span>}
              </div>
              {!course.is_sample && (
                <div className="pt-2">
                  <CanvasControls courseId={course.id} isSample={course.is_sample} paused={bundle.sources.find((x) => x.source === "canvas")?.paused ?? false} />
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
