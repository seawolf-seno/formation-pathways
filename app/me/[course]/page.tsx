import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStudentCourse, latestNextSteps, requireStudent } from "@/lib/mastery/queries";
import { allStandards } from "@/lib/mastery/config";
import { SharedSteps } from "@/components/mastery/NextStepsPanel";
import { standardOptions } from "@/lib/mastery/config";
import { MasteryView } from "@/components/mastery/MasteryView";
import { StudentRequests } from "@/components/mastery/StudentRequests";
import { shortDate } from "@/components/mastery/levels";
import { VideoShelf } from "@/components/mastery/VideoShelf";

const STATUS: Record<string, string> = { open: "Waiting", scheduled: "Scheduled", accepted: "Accepted as evidence", declined: "Not this time", done: "Done" };

/** A student's own mastery in one course: levels in words, every piece of
 *  evidence (with scores) behind them, next steps with links, and their
 *  requests to the teacher. RLS shows them nothing that isn't theirs. */
export default async function StudentCoursePage({ params }: { params: Promise<{ course: string }> }) {
  const student = await requireStudent();
  const { course: address } = await params;
  const data = await getStudentCourse(address, student.personId);
  if (!data) notFound();
  if (data.course.slug !== decodeURIComponent(address)) redirect(`/me/${data.course.slug}`);
  const courseId = data.course.id;
  const shared = await latestNextSteps(courseId, student.personId, true);
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6">
      <header>
        <Link href="/me" className="text-xs text-[var(--color-ink-muted)] underline">
          Your courses
        </Link>
        <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">{data.course.title}</h1>
        {data.course.is_sample && <p className="mt-1 text-xs uppercase tracking-wider text-[var(--color-gold)]">Fictional sample</p>}
      </header>
      {shared && shared.steps.length > 0 && (
        <SharedSteps steps={shared.steps} sharedBy={shared.shared_by_name} titles={Object.fromEntries(allStandards(data.config).map((s) => [s.code, s.title]))} />
      )}
      <MasteryView config={data.config} evidence={data.evidence} firstName={student.firstName} audience="student" finishedThrough={data.course.finished_through} grades={data.grades} khanSkills={data.khanSkills} khanLevels={data.khanLevels} />
      <VideoShelf config={data.config} finishedThrough={data.course.finished_through} you />
      <section>
        <h2 className="mb-3 font-display text-xl text-[var(--color-navy-ink)]">Ask your teacher</h2>
        <StudentRequests courseId={courseId} standards={standardOptions(data.config)} />
        {data.requests.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {data.requests.map((r) => (
              <li key={r.id} className="rounded-xl bg-white px-4 py-2">
                <span className="font-medium text-[var(--color-navy-ink)]">{r.kind === "oral_exam" ? "Oral exam" : "Work sent in"}</span>
                <span className="text-[var(--color-ink-muted)]">
                  {" "}
                  · {r.standard_code} · {shortDate(r.created_at)} · {STATUS[r.status]}
                </span>
                {r.response && <span className="block text-[var(--color-ink)]">Your teacher: “{r.response}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
