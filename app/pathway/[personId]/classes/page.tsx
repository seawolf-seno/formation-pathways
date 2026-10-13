import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonProfile, logAccess, requireStaff } from "@/lib/sor/queries";
import { classesForReflection } from "@/lib/sor/class-reflections";
import { parseVocabLines } from "@/lib/spark";
import { ClassReflections } from "@/components/sor/ClassReflections";

export const metadata = {
  title: "Your classes · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/**
 * Class reflections: a student, with a staff member beside them, taps the
 * classes they enjoy from their own schedule (Blackbaud class history and
 * Canvas) and says what makes each one good. Opened on the adult's own
 * signed-in device; saved as that adult; needs student_voice consent. The
 * taps live in /prompts so faculty can edit them. Enjoyment only: no ratings,
 * and a class left untapped is not recorded.
 */
export default async function ClassReflectionsPage({ params }: { params: Promise<{ personId: string }> }) {
  const staff = await requireStaff();
  const { personId } = await params;
  const profile = await getPersonProfile(personId);
  if (!profile) notFound();
  await logAccess(staff, "open_class_reflections", personId);

  const { person, consents } = profile;
  const firstName = person.preferred_name || person.first_name;
  const back = (
    <Link href={`/pilot/people/${personId}`} className="mt-4 inline-block text-sm underline">Back to {firstName}&apos;s page</Link>
  );
  if (!profile.classReflectionsReady) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">Class reflections aren&apos;t switched on yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">They arrive with the next database update. Nothing else is affected.</p>
        {back}
      </main>
    );
  }
  const consented = person.is_sample || consents.some((c) => c.scope === "student_voice" && !c.revoked_at);
  if (!consented) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">Student-voice consent isn&apos;t on file for {firstName} yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Record it on their page (Consent → Student voice) once the family has agreed, then come back.
        </p>
        {back}
      </main>
    );
  }

  const classes = classesForReflection(profile.courses, profile.classHistory);
  if (!classes.length) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">{firstName}&apos;s classes aren&apos;t here yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Their schedule comes from the Blackbaud and Canvas imports on the pilot page. Run one, then come back.
        </p>
        {back}
      </main>
    );
  }

  const likes = parseVocabLines(fs.readFileSync(path.join(process.cwd(), "prompts", "class-reflection-likes.txt"), "utf-8"));
  return <ClassReflections personId={personId} firstName={firstName} classes={classes} likes={likes} isSample={person.is_sample} />;
}
