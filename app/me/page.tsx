import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudentCourses, requireStudent } from "@/lib/mastery/queries";

/** A student's courses in the Mastery Hub; with only one, straight to it. */
export default async function StudentHome() {
  const student = await requireStudent();
  const courses = await getStudentCourses(student.personId);
  if (courses.length === 1) redirect(`/me/${courses[0].slug}`);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">Hi {student.firstName}</h1>
      {courses.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <li key={c.id}>
              <Link href={`/me/${c.slug}`} className="block rounded-2xl border border-[var(--color-border)] bg-white p-5 font-display text-xl text-[var(--color-navy-ink)] hover:border-[var(--color-pacific)]">
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">None of your courses use the Mastery Hub yet. Your teacher will let you know when one does.</p>
      )}
    </div>
  );
}
