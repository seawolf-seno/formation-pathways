import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseBundle, requireMasteryTeacher } from "@/lib/mastery/queries";
import { standardOptions } from "@/lib/mastery/config";
import { displayName } from "@/lib/sor/types";
import { OralUpdater } from "@/components/mastery/OralUpdater";

export const metadata = { title: "Oral exam · Mastery Hub", robots: { index: false, follow: false } };

/** The phone-sized oral exam / observation updater for one course. */
export default async function OralPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ student?: string; standard?: string; request?: string }>;
}) {
  await requireMasteryTeacher();
  const { course: address } = await params;
  const { student, standard, request } = await searchParams;
  const bundle = await getCourseBundle(address);
  if (!bundle) notFound();
  const { course, config, roster } = bundle;
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href={`/mastery/${course.slug}`} className="text-xs text-[var(--color-ink-muted)] underline">
        {course.title}
      </Link>
      <h1 className="mb-5 mt-1 font-display text-2xl text-[var(--color-navy-ink)]">Oral exam updater</h1>
      <OralUpdater
        courseId={course.id}
        students={roster.map((s) => ({ id: s.id, name: displayName(s) }))}
        standards={standardOptions(config)}
        scale={config.scale}
        initialStudent={roster.some((s) => s.id === student) ? student : undefined}
        initialStandard={standardOptions(config).some((s) => s.code === standard) ? standard : undefined}
        requestId={request && /^[0-9a-f-]{36}$/.test(request) ? request : undefined}
      />
    </div>
  );
}
