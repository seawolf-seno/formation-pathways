import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMasteryTeacher, staffNames } from "@/lib/mastery/queries";
import { rawStandardSet } from "@/lib/mastery/standard-sets";
import { getSorClient } from "@/lib/sor/supabase-server";
import { StandardsEditor } from "@/components/mastery/StandardsEditor";
import { RestoreVersion } from "@/components/mastery/NewStandardSetForm";

export const metadata = { title: "Edit standards · Mastery Hub", robots: { index: false, follow: false } };

export default async function StandardsEditPage({ params }: { params: Promise<{ key: string }> }) {
  const staff = await requireMasteryTeacher();
  const { key } = await params;
  const found = await rawStandardSet(key);
  if (!found) notFound();
  const names = await staffNames();
  const supabase = await getSorClient();
  const { data: versions } = await supabase
    .from("mastery_standard_set_versions")
    .select("id, saved_by, saved_at")
    .eq("key", key)
    .order("saved_at", { ascending: false })
    .limit(20);
  const owner = found.saved?.created_by ?? null;
  const canEdit = staff.role === "admin" || !found.saved || owner === staff.user_id;
  const note = !found.saved
    ? "Built-in standards from the repo. Your first save makes the hub's copy, which you then own (admins can edit any)."
    : canEdit
      ? "Every save is kept below, so you can always go back."
      : `Only ${names.get(owner!) ?? "the teacher who made these"} or an admin can change these. You can read them.`;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <Link href="/mastery/standards" className="text-xs text-[var(--color-ink-muted)] underline">
          Standards
        </Link>
        <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">{String(found.raw.title ?? key)}</h1>
      </header>
      <StandardsEditor key={found.saved?.updated_at ?? "file"} initial={found.raw as never} canEdit={canEdit} note={note} />
      {(versions?.length ?? 0) > 0 && (
        <details className="rounded-2xl border border-[var(--color-border)] bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--color-navy-ink)]">Earlier versions ({versions!.length})</summary>
          <ul className="mt-2 space-y-1">
            {versions!.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3">
                <span>
                  {new Date(v.saved_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {v.saved_by ? names.get(v.saved_by) ?? "a teacher" : "unknown"}
                  {i === 0 ? " (current)" : ""}
                </span>
                {i > 0 && canEdit && <RestoreVersion standardKey={key} versionId={v.id} />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
