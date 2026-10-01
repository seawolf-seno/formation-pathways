import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCourse,
  getCourseRoster,
  getCourseSkills,
  getSkillSnapshotsForCourse,
} from "@/lib/queries";
import { isLiveCanvasConfigured } from "@/lib/integrations/canvas";
import { SkillMatrix } from "@/components/SkillMatrix";
import { syncDemoDb } from "@/lib/demo-persist";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await syncDemoDb();
  const { id } = await params;
  const courseId = Number(id);
  const course = Number.isFinite(courseId) ? getCourse(courseId) : undefined;
  if (!course) notFound();

  const skills = getCourseSkills(course.id);
  const roster = getCourseRoster(course.id);
  const snapshots = getSkillSnapshotsForCourse(course.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/courses"
        className="mb-4 inline-block text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-navy-ink)]"
      >
        ← All courses
      </Link>

      <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
          {course.name}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {course.teacher_name}
        </p>
      </div>

      <SkillMatrix
        course={course}
        skills={skills}
        roster={roster}
        initialSnapshots={snapshots}
        canvasIsMocked={!isLiveCanvasConfigured()}
      />
    </div>
  );
}
