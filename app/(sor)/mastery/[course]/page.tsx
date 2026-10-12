import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addablePeople, findCourse, getCourseBundle, requireMasteryTeacher } from "@/lib/mastery/queries";
import { syncCanvasIfDue } from "@/lib/mastery/sync";
import { isScheduledImportConfigured } from "@/lib/mastery/scheduled";
import { standardOptions } from "@/lib/mastery/config";
import { displayName } from "@/lib/sor/types";
import { ClassMap, SOURCE_FILTERS, type SourceFilter } from "@/components/mastery/ClassMap";
import { ExportDrop } from "@/components/mastery/ExportDrop";
import { CanvasControls, CourseSettings, DeleteSampleCourse, RequestInbox, RosterPanel, SourceSwitch, type SourceRow } from "@/components/mastery/TeacherTools";
import { VideoShelf } from "@/components/mastery/VideoShelf";
import { shortDate } from "@/components/mastery/levels";

export const metadata = { title: "Mastery Hub · Formation Pathways", robots: { index: false, follow: false } };

const SOURCE_LABEL = { canvas: "Canvas", ap_classroom: "AP Classroom reports", khan: "Khan Academy (through Canvas)" } as const;

/**
 * One course for its teacher: requests waiting, the class map, where the
 * evidence comes from (with on/off switches), and the roster with student
 * sign-ins.
 */
export default async function CoursePage({ params, searchParams }: { params: Promise<{ course: string }>; searchParams: Promise<{ unit?: string; source?: string }> }) {
  const staff = await requireMasteryTeacher();
  const { course: address } = await params;
  const { unit, source } = await searchParams;
  const found = await findCourse(address);
  if (!found) notFound();
  // One spelling per course: /mastery/apphysics1 → /mastery/APPhysics1.
  if (found.slug !== decodeURIComponent(address)) redirect(`/mastery/${found.slug}${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`);
  let bundle = await getCourseBundle(found);
  if (!bundle) notFound();

  // A real course with Canvas connected checks it on opening (at most every
  // six hours); see syncCanvasIfDue.
  const canvasNote = await syncCanvasIfDue(bundle, staff.user_id);
  if (canvasNote) bundle = (await getCourseBundle(found)) ?? bundle;

  const { course, config, roster, evidence, requests, sources } = bundle;
  const names = new Map(roster.map((s) => [s.id, displayName(s)]));
  const waiting = requests.filter((r) => r.status === "open" || r.status === "scheduled");
  const sourceRows: SourceRow[] = (["canvas", "ap_classroom", "khan"] as const).map((source) => {
    const s = sources.find((x) => x.source === source);
    return { source, label: SOURCE_LABEL[source], paused: s?.paused ?? false, lastRun: s?.last_run_at ?? null, summary: s?.last_summary ?? null };
  });
  const people = await addablePeople(course.is_sample);
  const automatic = isScheduledImportConfigured() && !course.is_sample;
  const options = standardOptions(config);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/mastery" className="text-xs text-[var(--color-ink-muted)] underline">
            Mastery Hub
          </Link>
          <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">{course.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            /mastery/{course.slug} · {roster.length} student{roster.length === 1 ? "" : "s"} · standards: {config.title}
            {course.is_sample && " · fictional sample"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/mastery/${course.slug}/oral`} className="rounded-xl bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white">
            Oral exam updater
          </Link>
          <Link href={`/mastery/${course.slug}/log`} className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm text-[var(--color-navy-ink)]">
            Log
          </Link>
        </div>
      </header>

      <section>
        <h2 className="mb-3 font-display text-xl text-[var(--color-navy-ink)]">
          Requests {waiting.length > 0 && <span className="text-base text-[var(--color-ink-muted)]">({waiting.length})</span>}
        </h2>
        <RequestInbox
          courseId={course.id}
          courseSlug={course.slug}
          items={waiting.map((r) => ({
            id: r.id,
            student: names.get(r.person_id) ?? "A student",
            personId: r.person_id,
            standard: r.standard_code,
            kind: r.kind,
            message: r.message,
            link: r.link,
            status: r.status,
            response: r.response,
            when: shortDate(r.created_at),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-[var(--color-navy-ink)]">The class</h2>
        <ClassMap
          courseSlug={course.slug}
          config={config}
          roster={roster}
          evidence={evidence}
          unit={unit ?? null}
          source={source && source in SOURCE_FILTERS ? (source as SourceFilter) : null}
        />
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">Course settings</h2>
        <CourseSettings
          courseId={course.id}
          slug={course.slug}
          canvasCourseId={course.canvas_course_id}
          finishedThrough={course.finished_through}
          units={config.groups.filter((g) => g.unitNumber !== null).map((g) => ({ number: g.unitNumber!, title: g.title }))}
          isSample={course.is_sample}
        />
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          Students sign in and find this course at /me/{course.slug}. Finished units lead their next steps and the videos.
        </p>
      </section>

      <VideoShelf config={config} finishedThrough={course.finished_through} you={false} />

      <section>
        <h2 className="mb-1 font-display text-xl text-[var(--color-navy-ink)]">Where evidence comes from</h2>
        <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
          Each source can be paused; every import and every change is in the log. Oral exams and observations come from the
          updater; students send work in from their own page.
        </p>
        <div className="space-y-4">
          {sourceRows.map((row) => (
            <div key={row.source} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--color-navy-ink)]">{row.label}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {row.lastRun ? `Last: ${shortDate(row.lastRun)}. ${row.summary ?? ""}` : "Not run yet."}
                  </p>
                </div>
                <SourceSwitch courseId={course.id} row={row} />
              </div>
              <div className="mt-3">
                {row.source === "canvas" ? (
                  <>
                    <CanvasControls courseId={course.id} isSample={course.is_sample} paused={row.paused} />
                    {canvasNote && <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Checked on opening: {canvasNote}</p>}
                    <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                      Counts graded work whose title names a standard by code (&quot;Unit 2 quiz [2.5, 2.7]&quot;), by unit
                      (&quot;Unit 2 Test&quot;) or by name (&quot;Newton&apos;s second law&quot;), and Canvas Outcome results.{" "}
                      {automatic
                        ? "Checked automatically every three hours, and when you open this page."
                        : "Checked when you open this page (at most every six hours). Automatic checks every few hours are built but not switched on yet."}
                    </p>
                  </>
                ) : row.source === "ap_classroom" ? (
                  <>
                    <ExportDrop
                      courseId={course.id}
                      standards={options}
                      paused={Object.fromEntries(sourceRows.map((r) => [r.source, r.paused]))}
                    />
                    <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                      AP Classroom has no way to send scores anywhere, so its reports come in by hand: download the CSV from each
                      progress check and drop them here together. You see what will be saved before anything is. No passwords,
                      no scraping.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    No uploads: Khan Academy work counts when it reaches Canvas (Khan&apos;s grade sync for Canvas, via Clever LMS
                    Connect), and Khan skill names map to standards on their own. Until that sync is on, the drop-in above takes a
                    Khan CSV as a fallback.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-xl text-[var(--color-navy-ink)]">Students and sign-ins</h2>
        <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
          A student signs in with their school address (an emailed code) and sees only their own mastery, evidence and next
          steps.
        </p>
        <RosterPanel
          courseId={course.id}
          courseSlug={course.slug}
          roster={roster.map((s) => ({ id: s.id, name: displayName(s), email: s.email, active: s.account_active, isSample: s.is_sample }))}
          addable={people.map((p) => ({ id: p.id, name: displayName(p) }))}
        />
      </section>

      {course.is_sample && (
        <footer className="border-t border-[var(--color-border)] pt-4">
          <DeleteSampleCourse courseId={course.id} />
        </footer>
      )}
    </div>
  );
}
