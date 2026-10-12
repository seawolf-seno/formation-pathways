import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseBundle, latestNextSteps, requireMasteryTeacher } from "@/lib/mastery/queries";
import { allStandards } from "@/lib/mastery/config";
import { nextStepsPayload } from "@/lib/mastery/next-steps-server";
import { getSorClient } from "@/lib/sor/supabase-server";
import { NextStepsPanel } from "@/components/mastery/NextStepsPanel";
import { SentToAi } from "@/components/sor/SentToAi";
import { logAccess } from "@/lib/sor/queries";
import { standardOptions } from "@/lib/mastery/config";
import { displayName } from "@/lib/sor/types";
import { MasteryView } from "@/components/mastery/MasteryView";
import { AddEvidenceForm } from "@/components/mastery/TeacherTools";

export const metadata = { title: "Student mastery · Mastery Hub", robots: { index: false, follow: false } };

/** The teacher's copy of one student's mastery page: what the student sees,
 *  plus removing and adding evidence. */
export default async function TeacherStudentPage({ params }: { params: Promise<{ course: string; personId: string }> }) {
  const staff = await requireMasteryTeacher();
  const { course: address, personId } = await params;
  const bundle = await getCourseBundle(address);
  const courseId = bundle?.course.id ?? "";
  const student = bundle?.roster.find((s) => s.id === personId);
  if (!bundle || !student) notFound();
  await logAccess(staff, "open_mastery", personId, { course: courseId });
  const firstName = student.preferred_name || student.first_name;
  const saved = await latestNextSteps(courseId, personId);
  const titles = Object.fromEntries(allStandards(bundle.config).map((s) => [s.code, s.title]));
  const supabase = await getSorClient();
  const { data: consents } = await supabase.from("consents").select("scope, revoked_at").eq("person_id", personId);
  const aiConsent = (consents ?? []).some((c) => c.scope === "ai_drafting" && !c.revoked_at);
  const aiAllowed = student.is_sample || (process.env.AI_REAL_STUDENTS?.trim() === "on" && aiConsent);
  const aiNote = aiAllowed
    ? `Claude drafts a few next steps from ${firstName}'s levels and recent work (names removed, no scores) using only this course's links. You edit, then share. ${firstName} sees nothing until you do.`
    : `Drafted from the rules (AI drafting ${student.is_sample ? "" : aiConsent ? "is switched off for real students" : "consent isn't on file"}). You edit, then share.`;
  const payload = nextStepsPayload(bundle, personId, staff.display_name);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <Link href={`/mastery/${bundle.course.slug}`} className="text-xs text-[var(--color-ink-muted)] underline">
          {bundle.course.title}
        </Link>
        <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">{displayName(student)}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {student.email && student.account_active ? `Sees this page when they sign in as ${student.email}.` : "No student sign-in yet."}{" "}
          <Link href={`/pilot/people/${personId}`} className="underline">
            Their pilot page
          </Link>
        </p>
      </header>
      <NextStepsPanel
        courseId={courseId}
        personId={personId}
        firstName={firstName}
        saved={saved && { id: saved.id, steps: saved.steps, usedAi: saved.used_ai, status: saved.status, sharedBy: saved.shared_by_name, sharedAt: saved.shared_at }}
        titles={titles}
        aiNote={aiNote}
      />
      {aiAllowed && <SentToAi text={payload.text} leaks={payload.anon.findNames(payload.text).length} />}
      <MasteryView
        config={bundle.config}
        evidence={bundle.evidence.filter((e) => e.person_id === personId)}
        firstName={firstName}
        audience="teacher"
        courseIdForTeacher={courseId}
        finishedThrough={bundle.course.finished_through}
      />
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">Add evidence by hand</h2>
        <AddEvidenceForm courseId={courseId} personId={personId} standards={standardOptions(bundle.config)} />
      </section>
    </div>
  );
}
