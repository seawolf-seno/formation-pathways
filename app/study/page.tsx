import fs from "fs";
import path from "path";
import Link from "next/link";
import { requireStudent } from "@/lib/mastery/queries";
import { getStudentStudy } from "@/lib/sor/student-study";
import { suggestionsByClass } from "@/lib/sor/class-resources";
import { parseStudyLibrary, resourcesForClass } from "@/lib/sor/study-library";
import { StudyHub } from "@/components/sor/StudyHub";

const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <main className="mx-auto max-w-lg px-6 py-24 text-center">
    <p className="font-display text-xl text-[var(--color-navy-ink)]">{title}</p>
    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{children}</p>
    <Link href="/me" className="mt-4 inline-block text-sm underline">Your mastery</Link>
  </main>
);

/**
 * The Study Hub for a signed-in student: their own classes, from the schedule
 * already imported (Blackbaud class history and Canvas), each with the shared
 * study library's free resources, links other students found useful (once a
 * teacher has approved them, with no names) and what they said they enjoy
 * about it. The staff-opened version is /pathway/[personId]/study; this one
 * shows the student only what is theirs (RLS), and nothing about how they are
 * doing in a class. Saving (what they enjoy, a link that helped) needs
 * student-voice consent; without it the page is read-only.
 */
export default async function StudentStudyPage() {
  const student = await requireStudent();
  const study = await getStudentStudy(student.personId);
  if (!study.ready) {
    return <Notice title="The Study Hub isn't switched on yet.">It arrives with the next update. Nothing else is affected.</Notice>;
  }
  if (!study.classes.length) {
    return <Notice title="Your classes aren't here yet.">Your schedule comes from the school&apos;s records. Ask your teacher to check that it has been brought in.</Notice>;
  }

  const library = parseStudyLibrary(JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "study-library.json"), "utf-8")));
  const enjoyed = new Map(study.reflections.map((c) => [c.key, c]));
  const byClass = suggestionsByClass(study.resources, student.personId, study.classes);
  return (
    <StudyHub
      self
      personId={student.personId}
      firstName={student.firstName}
      isSample={student.isSample}
      classes={study.classes.map((c) => ({
        ...c,
        shared: resourcesForClass(c.title, library),
        reflection: enjoyed.get(c.key),
        suggestions: byClass.get(c.key) ?? { approved: [], waiting: [] },
      }))}
      canReflect={study.voice}
      canSuggest={study.voice}
    />
  );
}
