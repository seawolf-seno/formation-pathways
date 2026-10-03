import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonProfile, logAccess, requireStaff } from "@/lib/sor/queries";
import { parseChoiceLines, parseVocabLines } from "@/lib/spark";
import { SparkSky } from "@/components/sor/SparkSky";

export const metadata = {
  title: "Your sparks · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

const readPrompt = (name: string) => fs.readFileSync(path.join(process.cwd(), "prompts", name), "utf-8");

/**
 * The Spark experience: a student, with a staff member beside them, lights up
 * what they love by voice, taps and quick choices. Opened on the adult's own
 * signed-in device; saved as that adult; needs student_voice consent. Questions
 * and vocabulary live in /prompts so faculty can edit them.
 */
export default async function SparkPage({ params }: { params: Promise<{ personId: string }> }) {
  const staff = await requireStaff();
  const { personId } = await params;
  const profile = await getPersonProfile(personId);
  if (!profile) notFound();
  await logAccess(staff, "open_spark", personId);

  const { person, consents } = profile;
  const firstName = person.preferred_name || person.first_name;
  const consented = person.is_sample || consents.some((c) => c.scope === "student_voice" && !c.revoked_at);
  if (!consented) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">Student-voice consent isn&apos;t on file for {firstName} yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Record it on their page (Consent → Student voice) once the family has agreed, then come back.
        </p>
        <Link href={`/pilot/people/${personId}`} className="mt-4 inline-block text-sm underline">Back to {firstName}&apos;s page</Link>
      </main>
    );
  }

  const questions = readPrompt("student-spark-questions.txt").split("\n").map((q) => q.trim()).filter(Boolean);
  return (
    <SparkSky
      personId={personId}
      firstName={firstName}
      questions={questions}
      interests={parseVocabLines(readPrompt("spark-interests.txt"))}
      pairs={parseChoiceLines(readPrompt("spark-choices.txt"))}
      isSample={person.is_sample}
    />
  );
}
