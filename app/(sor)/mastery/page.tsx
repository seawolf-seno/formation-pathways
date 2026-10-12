import Link from "next/link";
import { getMyCourses, masteryConfigs, requireMasteryTeacher } from "@/lib/mastery/queries";
import { NewCourseForm, SampleCourseButton } from "@/components/mastery/TeacherTools";

export const metadata = { title: "Mastery Hub · Formation Pathways", robots: { index: false, follow: false } };

/**
 * The Mastery Hub's front door for a teacher (Fizzy #37): their courses, and
 * a way to start one or to try the hub on a fictional sample class.
 */
export default async function MasteryHome() {
  await requireMasteryTeacher();
  const courses = await getMyCourses();
  if (courses === null) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">The Mastery Hub isn&apos;t switched on yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          It needs the database migration <code>20261019000000_mastery_hub.sql</code>, which seno applies (staging first). See
          docs/mastery-hub.md.
        </p>
      </div>
    );
  }
  const configs = masteryConfigs();
  const hasSample = courses.some((c) => c.is_sample);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">Mastery Hub</p>
        <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">Your courses</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
          Mastery by standard, from Canvas, AP Classroom and Khan Academy reports, oral exams, and the work students send in.
          Students sign in to see where they are and what to do next. Grades and scores stay here: they never reach a Pathway
          page, a family, or an AI.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <Link key={c.id} href={`/mastery/${c.slug}`} className="rounded-2xl border border-[var(--color-border)] bg-white p-5 hover:border-[var(--color-pacific)]">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-xl text-[var(--color-navy-ink)]">{c.title}</p>
              {c.is_sample && (
                <span className="rounded bg-[var(--color-gold-light)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
                  Fictional sample
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              /mastery/{c.slug} · {c.students} student{c.students === 1 ? "" : "s"}
              {c.waiting > 0 && ` · ${c.waiting} request${c.waiting === 1 ? "" : "s"} waiting`}
            </p>
          </Link>
        ))}
        {!courses.length && <p className="text-sm text-[var(--color-ink-muted)]">No courses yet.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-[var(--color-navy-ink)]">Start a course</h2>
        <NewCourseForm configs={configs} />
        <p className="text-xs text-[var(--color-ink-muted)]">
          Standards come from a file in <code>fixtures/mastery/</code>; another subject is one more file (docs/mastery-hub.md).
          The Canvas course id is the number in the course&apos;s Canvas address, and you can add it later.
        </p>
        {!hasSample && (
          <div className="pt-2">
            <SampleCourseButton />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">The fictional sample students, seven weeks of made-up evidence. Try everything without a real student.</p>
          </div>
        )}
      </section>
    </div>
  );
}
