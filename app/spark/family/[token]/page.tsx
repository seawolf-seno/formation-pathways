import fs from "fs";
import path from "path";
import { connection } from "next/server";
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { parseChoiceLines, parseVocabLines } from "@/lib/spark";
import { SparkSky } from "@/components/sor/SparkSky";

export const metadata = {
  title: "Your sparks · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

const readPrompt = (name: string) => fs.readFileSync(path.join(process.cwd(), "prompts", name), "utf-8");

/**
 * At-home Spark, opened from a one-time link a staff member sent the family.
 * No sign-in. The page learns only the student's first name (for the
 * greeting) from the database function, and can submit sparks once. See
 * supabase/migrations/20261004150000_spark_family_links.sql.
 */
export default async function FamilySparkPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  let firstName: string | null = null;
  let payloadReady = false;
  if (isSorConfigured() && /^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    const supabase = await getSorClient();
    const [greeting, readiness] = await Promise.all([
      supabase.rpc("spark_link_greeting", { p_token: token }),
      supabase.rpc("spark_media_ready"),
    ]);
    firstName = (Array.isArray(greeting.data) ? greeting.data[0]?.first_name : null) ?? null;
    payloadReady = !readiness.error && readiness.data === true;
  }

  if (!firstName) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
        <p className="font-display text-2xl text-[var(--color-navy-ink)]">This link has expired or was already used.</p>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Links work once and last a week. Ask your teacher or advisor at Pacifica Christian for a new one.
        </p>
      </main>
    );
  }

  if (!payloadReady) {
    return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
      <p className="font-display text-2xl text-[var(--color-navy-ink)]">Spark is being updated.</p>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Your link has not been used. Please come back shortly, or ask your teacher to check the update.</p>
    </main>;
  }

  const questions = readPrompt("student-spark-questions.txt").split("\n").map((q) => q.trim()).filter(Boolean);
  // Two lines, in order: the proud question then the intention. See the file.
  const skillQuestions = readPrompt("spark-skills.txt").split("\n").map((q) => q.trim()).filter((q) => q && !q.startsWith("#"));
  return (
    <SparkSky
      target={{ kind: "family", token }}
      firstName={firstName}
      questions={questions}
      skillQuestions={skillQuestions}
      interests={parseVocabLines(readPrompt("spark-interests.txt"))}
      pairs={parseChoiceLines(readPrompt("spark-choices.txt"))}
      genres={parseVocabLines(readPrompt("spark-media.txt"))}
      isSample={false}
    />
  );
}
