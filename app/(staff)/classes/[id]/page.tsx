import { notFound } from "next/navigation";
import Link from "next/link";
import { getClass, getClassRoster, getStudentsWithStats } from "@/lib/queries";
import { StudentList } from "@/components/StudentList";
import { EnrollmentManager } from "@/components/EnrollmentManager";
import { syncDemoDb } from "@/lib/demo-persist";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await syncDemoDb();
  const { id } = await params;
  const classId = Number(id);
  const schoolClass = Number.isFinite(classId) ? getClass(classId) : undefined;
  if (!schoolClass) notFound();

  const roster = getClassRoster(schoolClass.id);
  const allStudents = getStudentsWithStats();

  return (
    <div>
      <div className="mx-auto max-w-5xl px-6 pt-8">
        <Link
          href="/classes"
          className="mb-4 inline-block text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-navy-ink)]"
        >
          ← All classes
        </Link>

        <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            {schoolClass.name}
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {roster.length} student{roster.length === 1 ? "" : "s"}
          </p>
          <EnrollmentManager
            classId={schoolClass.id}
            roster={roster}
            allStudents={allStudents}
          />
        </div>
      </div>

      <StudentList students={roster} />
    </div>
  );
}
