import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApplicantBySparkToken } from "@/lib/queries";
import { parseChoiceLines, parseVocabLines } from "@/lib/spark";
import { SparkSurvey } from "@/components/SparkSurvey";

// Public. The one write surface a family reaches with no school sign-in: see
// submitSparkResponseAction (lib/actions.ts) and docs/interest-survey.md for
// why that's safe (narrowly scoped, no essay/status access).
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const applicant = getApplicantBySparkToken(token);
  return {
    title: applicant ? `Quick spark, ${applicant.name.split(" ")[0]}` : "Pacifica Christian High School",
    robots: { index: false, follow: false },
  };
}

function loadInterests() {
  return parseVocabLines(
    fs.readFileSync(path.join(process.cwd(), "prompts", "spark-interests.txt"), "utf-8")
  );
}
function loadChoices() {
  return parseChoiceLines(
    fs.readFileSync(path.join(process.cwd(), "prompts", "spark-choices.txt"), "utf-8")
  );
}

export default async function SparkPage({ params }: Props) {
  const { token } = await params;
  const applicant = getApplicantBySparkToken(token);
  if (!applicant) notFound();

  const locked = applicant.status === "approved" || applicant.status === "enrolled";

  return (
    <main className="min-h-full bg-[var(--color-canvas)] px-5 py-12">
      <div className="mx-auto max-w-md">
        {locked ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="font-display text-xl text-[var(--color-navy-ink)]">
              This application has already been decided, so this quick survey is closed.
            </p>
          </div>
        ) : (
          <SparkSurvey
            sparkToken={token}
            firstName={applicant.name.split(" ")[0]}
            interests={loadInterests()}
            choicePairs={loadChoices()}
            existing={applicant.spark_response}
          />
        )}
      </div>
    </main>
  );
}
