import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/mastery/queries";
import { getStudentStudy } from "@/lib/sor/student-study";
import { parseVocabLines } from "@/lib/spark";
import { ClassReflections } from "@/components/sor/ClassReflections";

export const metadata = { title: "Your classes · Pacifica Christian" };

/**
 * Class reflections for a signed-in student: tap the classes they enjoy from
 * their own schedule and say what makes each one good. Saved as the student
 * (no staff member recorded); needs student_voice consent. The staff-opened
 * version is /pathway/[personId]/classes. Enjoyment only: no ratings, and a
 * class left untapped is not recorded.
 */
export default async function StudentClassReflectionsPage() {
  const student = await requireStudent();
  const study = await getStudentStudy(student.personId);
  // Nothing to tap, or saving isn't open to them: the Study Hub says why.
  if (!study.ready || !study.voice || !study.classes.length) redirect("/study");

  const likes = parseVocabLines(fs.readFileSync(path.join(process.cwd(), "prompts", "class-reflection-likes.txt"), "utf-8"));
  return <ClassReflections self personId={student.personId} firstName={student.firstName} classes={study.classes} likes={likes} isSample={student.isSample} />;
}
