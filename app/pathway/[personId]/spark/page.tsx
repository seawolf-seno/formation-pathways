import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonProfile, logAccess, requireStaff } from "@/lib/sor/queries";
import { getSorClient } from "@/lib/sor/supabase-server";
import { pairFor, parsePair } from "@/lib/sor/spark-lab";
import { parseChoiceLines, parseVocabLines } from "@/lib/spark";
import { SparkSky } from "@/components/sor/SparkSky";
import { SparkLab } from "@/components/sor/SparkLab";

/** Swipe cards per sitting, drawn in a fresh order each time. */
const CARDS_PER_SITTING = 18;

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
 *
 * By default this is the Spark Lab: two formats back to back, the pair taken
 * from a rotation (lib/sor/spark-lab.ts) so the comparison stays fair.
 * `?format=classic` runs the original single flow; `?pair=starters,swipe`
 * chooses the two formats.
 */
export default async function SparkPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ format?: string; pair?: string }>;
}) {
  const query = await searchParams;
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
  const interests = parseVocabLines(readPrompt("spark-interests.txt"));
  const pairs = parseChoiceLines(readPrompt("spark-choices.txt"));
  const genres = parseVocabLines(readPrompt("spark-media.txt"));
  // Two lines, in order: the proud question then the intention. See the file.
  const skillQuestions = readPrompt("spark-skills.txt").split("\n").map((q) => q.trim()).filter((q) => q && !q.startsWith("#"));

  if (query.format !== "classic") {
    // Lab sittings so far (counted by their first leg), for the rotation.
    const supabase = await getSorClient();
    const { count } = await supabase
      .from("student_sparks")
      .select("id", { count: "exact", head: true })
      .eq("sparks->lab->>order", "1");
    const labId = randomUUID();
    const order = (label: string) => createHash("sha256").update(labId + label).digest("hex");
    const cards = parseVocabLines(readPrompt("spark-cards.txt"))
      .sort((a, b) => order(a.label).localeCompare(order(b.label)))
      .slice(0, CARDS_PER_SITTING);
    return (
      <SparkLab
        personId={personId}
        firstName={firstName}
        isSample={person.is_sample}
        pair={parsePair(query.pair) ?? pairFor(count ?? 0)}
        labId={labId}
        // The current flow, trimmed to three questions so both legs take about as long.
        classic={{ questions: questions.slice(0, 3), interests, pairs }}
        starters={readPrompt("spark-starters.txt").split("\n").map((q) => q.trim()).filter(Boolean)}
        cards={cards}
        genres={genres}
        skillQuestions={skillQuestions}
      />
    );
  }

  return (
    <SparkSky
      target={{ kind: "staff", personId }}
      firstName={firstName}
      questions={questions}
      interests={interests}
      pairs={pairs}
      genres={genres}
      skillQuestions={skillQuestions}
      isSample={person.is_sample}
    />
  );
}
