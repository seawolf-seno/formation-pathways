import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCourseSkills,
  getCoursesForStudent,
  getObservationsForStudent,
  getPortraitsForStudent,
  getSkillSnapshotsForStudent,
  getStudent,
  getTagCounts,
} from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";
import { humanDaysAgo } from "@/lib/format";
import { daysSince } from "@/lib/format";
import { TagCountChips } from "@/components/TagChips";
import { Timeline } from "@/components/Timeline";
import { PortraitPanel } from "@/components/PortraitPanel";
import { StudentPageCapture } from "@/components/StudentPageCapture";
import { StudentSkills } from "@/components/StudentSkills";
import type { CourseSkill } from "@/lib/types";

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);
  const student = Number.isFinite(studentId) ? getStudent(studentId) : undefined;
  if (!student) notFound();

  const observations = getObservationsForStudent(student.id);
  const portraits = await getPortraitsForStudent(student.id);
  const tagCounts = getTagCounts(observations);
  const lastObservedDays = observations[0]
    ? daysSince(observations[0].created_at)
    : null;

  const courses = getCoursesForStudent(student.id);
  const skillsByCourse = new Map<number, CourseSkill[]>(
    courses.map((c) => [c.id, getCourseSkills(c.id)])
  );
  const skillSnapshots = getSkillSnapshotsForStudent(student.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-navy-ink)]"
      >
        ← Roster
      </Link>

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            {student.name}
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Grade {student.grade} · {observations.length} observation
            {observations.length === 1 ? "" : "s"} · last witnessed{" "}
            {lastObservedDays === null ? "never" : humanDaysAgo(lastObservedDays)}
          </p>
        </div>
        <StudentPageCapture studentId={student.id} studentName={student.name} />
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
          Formation tags
        </h2>
        <TagCountChips counts={tagCounts} />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
          Pathway Portrait
        </h2>
        <PortraitPanel
          studentId={student.id}
          initialPortraits={portraits}
          admissionsAvailable={isSupabaseConfigured()}
        />
      </div>

      {courses.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
            Skills
          </h2>
          <StudentSkills
            courses={courses}
            skillsByCourse={skillsByCourse}
            snapshots={skillSnapshots}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
          Timeline
        </h2>
        <Timeline observations={observations} />
      </div>
    </div>
  );
}
