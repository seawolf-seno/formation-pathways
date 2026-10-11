import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClassResources, getPersonProfile, logAccess, requireStaff } from "@/lib/sor/queries";
import { suggestionsByClass } from "@/lib/sor/class-resources";
import { classesForReflection, latestReflections } from "@/lib/sor/class-reflections";
import { parseStudyLibrary, resourcesForClass } from "@/lib/sor/study-library";
import { StudyHub } from "@/components/sor/StudyHub";

export const metadata = {
  title: "Study Hub · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/**
 * The Study Hub: a student's own classes, from the schedule already imported
 * (Blackbaud class history and Canvas), each with the shared study library's
 * free resources for that subject and what the student said they enjoy about
 * it. Opened on a staff member's signed-in device and explored together:
 * there is no student login yet. A student can also suggest a link that
 * helped them (shown to others only once a teacher approves it). Nothing
 * about how the student is doing in a class is shown. The library is
 * fixtures/study-library.json, which faculty can edit.
 */
export default async function StudyHubPage({ params }: { params: Promise<{ personId: string }> }) {
  const staff = await requireStaff();
  const { personId } = await params;
  const profile = await getPersonProfile(personId);
  if (!profile) notFound();
  await logAccess(staff, "open_study_hub", personId);

  const { person, consents } = profile;
  const firstName = person.preferred_name || person.first_name;
  const classes = classesForReflection(profile.courses, profile.classHistory);
  if (!classes.length) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">{firstName}&apos;s classes aren&apos;t here yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Their schedule comes from the Blackbaud and Canvas imports on the pilot page. Run one, then come back.
        </p>
        <Link href={`/pilot/people/${personId}`} className="mt-4 inline-block text-sm underline">Back to {firstName}&apos;s page</Link>
      </main>
    );
  }

  const library = parseStudyLibrary(JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "study-library.json"), "utf-8")));
  const enjoyed = new Map(latestReflections(profile.classReflections).map((c) => [c.key, c]));
  const suggested = await getClassResources(classes);
  const byClass = suggestionsByClass(suggested.rows, personId, classes);
  const voiceConsent = person.is_sample || consents.some((c) => c.scope === "student_voice" && !c.revoked_at);
  return (
    <StudyHub
      personId={personId}
      firstName={firstName}
      isSample={person.is_sample}
      classes={classes.map((c) => ({
        ...c,
        shared: resourcesForClass(c.title, library),
        reflection: enjoyed.get(c.key),
        suggestions: byClass.get(c.key) ?? { approved: [], waiting: [] },
      }))}
      canReflect={profile.classReflectionsReady && voiceConsent}
      canSuggest={suggested.ready && voiceConsent}
    />
  );
}
