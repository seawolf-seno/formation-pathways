import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseBundle, getCourseLog, requireMasteryTeacher, staffNames } from "@/lib/mastery/queries";
import { displayName } from "@/lib/sor/types";
import { shortDate } from "@/components/mastery/levels";

export const metadata = { title: "Log · Mastery Hub", robots: { index: false, follow: false } };

const ACTION: Record<string, string> = {
  mastery_evidence_insert: "Evidence added",
  mastery_evidence_delete: "Evidence removed",
  mastery_roster_insert: "Added to the course",
  mastery_roster_delete: "Removed from the course",
  mastery_requests_insert: "Request sent",
  mastery_requests_update: "Request answered",
  mastery_sources_insert: "Source switched",
  mastery_sources_update: "Source switched",
  student_accounts_insert: "Student sign-in given",
  student_accounts_update: "Student sign-in changed",
  student_accounts_delete: "Student sign-in removed",
  import_canvas: "Canvas checked",
  import_ap_classroom: "AP Classroom report saved",
  import_khan: "Khan Academy report saved",
};

function describe(detail: Record<string, unknown>): string {
  if (typeof detail.summary === "string") return detail.summary;
  const parts: string[] = [];
  if (detail.standard) parts.push(String(detail.standard));
  if (detail.title) parts.push(String(detail.title));
  if (detail.level) parts.push(String(detail.level));
  else if (detail.score !== undefined && detail.score !== null) parts.push(`${detail.score}/${detail.max}`);
  if (detail.kind) parts.push(String(detail.kind).replace("_", " "));
  if (detail.status) parts.push(String(detail.status));
  if (detail.source && !detail.title) parts.push(String(detail.source).replace("_", " "));
  if (detail.paused !== undefined) parts.push(detail.paused ? "paused" : "on");
  if (detail.active !== undefined) parts.push(detail.active ? "on" : "off");
  return parts.join(" · ");
}

/** Every automatic import and every manual change in a course, newest first.
 *  Nobody can edit or delete it (the database refuses). */
export default async function LogPage({ params }: { params: Promise<{ course: string }> }) {
  await requireMasteryTeacher();
  const { course: address } = await params;
  const bundle = await getCourseBundle(address);
  if (!bundle) notFound();
  const [log, staff] = await Promise.all([getCourseLog(bundle.course.id), staffNames()]);
  const people = new Map(bundle.roster.map((s) => [s.id, displayName(s)]));
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href={`/mastery/${bundle.course.slug}`} className="text-xs text-[var(--color-ink-muted)] underline">
        {bundle.course.title}
      </Link>
      <h1 className="mb-4 mt-1 font-display text-3xl text-[var(--color-navy-ink)]">Log</h1>
      <ul className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-white text-sm">
        {log.map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-2">
            <span>
              <strong className="font-medium text-[var(--color-navy-ink)]">{ACTION[l.action] ?? l.action}</strong>
              {l.person_id && <span className="text-[var(--color-ink-muted)]"> · {people.get(l.person_id) ?? "A former student"}</span>}
              <span className="block text-xs text-[var(--color-ink-muted)]">{describe(l.detail)}</span>
            </span>
            <span className="text-xs text-[var(--color-ink-muted)]">
              {l.actor ? staff.get(l.actor) ?? (l.action === "mastery_requests_insert" ? "The student" : "Another staff member") : "System"} · {shortDate(l.at)}{" "}
              {new Date(l.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}
            </span>
          </li>
        ))}
        {!log.length && <li className="p-4 text-[var(--color-ink-muted)]">Nothing yet.</li>}
      </ul>
    </div>
  );
}
