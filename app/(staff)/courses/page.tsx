import Link from "next/link";
import { getCourses, getStudentsWithStats } from "@/lib/queries";
import { NewCourseForm } from "@/components/NewCourseForm";
import { syncDemoDb } from "@/lib/demo-persist";

export default async function CoursesPage() {
  await syncDemoDb();
  const courses = getCourses();
  const students = getStudentsWithStats();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            Courses
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Canvas + Google Drive, mapped to teacher-defined skills —
            narratives, never numbers.
          </p>
        </div>
        <NewCourseForm students={students} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <ul className="divide-y divide-[var(--color-border)]">
          {courses.map((c) => (
            <li key={c.id} className="px-5 py-4">
              <Link
                href={`/courses/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-display text-base text-[var(--color-navy-ink)]">
                    {c.name}
                  </span>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    {c.teacher_name} · {c.student_count} student
                    {c.student_count === 1 ? "" : "s"} · {c.skill_count} skill
                    {c.skill_count === 1 ? "" : "s"}
                    {c.drive_doc_name ? ` · linked to "${c.drive_doc_name}"` : ""}
                  </p>
                </div>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {c.last_synced_at
                    ? `synced ${new Date(c.last_synced_at).toLocaleDateString()}`
                    : "not synced yet"}
                </span>
              </Link>
            </li>
          ))}
          {courses.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-[var(--color-ink-muted)]">
              No courses yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
