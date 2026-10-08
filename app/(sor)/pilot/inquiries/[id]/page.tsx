import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getInquiry, logAccess, requireStaff } from "@/lib/sor/queries";
import { DraftInquiryPathwayButton, InquiryDraftReview, InquiryStatusPicker } from "@/components/sor/InquiryControls";
import { describeSent, inquiryInput } from "@/lib/sor/ai-input";
import { SentToAi } from "@/components/sor/SentToAi";

// Drafting runs here as a Server Action and takes about two minutes.
export const maxDuration = 300;

export const metadata = { title: "Inquiry · Formation Pathways" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * One inquiring family: what they told us, their Formation Pathway (draft,
 * keep up to three, sign) and a link to what the family will see. AI drafting
 * runs for fictional samples now; for real families it waits on
 * AI_REAL_STUDENTS, the same switch as students (card #22).
 */
export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const found = await getInquiry(id);
  if (!found) notFound();
  const { inquiry: i, drafts } = found;
  await logAccess(staff, "view_inquiry", null, { inquiry: i.id });

  const signed = drafts.find((d) => d.status === "approved");
  const latestDraft = drafts.find((d) => d.status === "draft");
  const aiAllowed = i.is_sample || process.env.AI_REAL_STUDENTS?.trim() === "on";
  const { anon, ...payload } = inquiryInput(i);
  const sentToAi = describeSent(payload, anon);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/pilot/inquiries" className="text-xs text-[var(--color-ink-muted)] hover:underline">← Inquiries</Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">
            {i.child_first_name} {i.child_last_name}
            {i.is_sample && <span className="ml-2 align-middle rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase">Sample</span>}
          </h1>
          <InquiryStatusPicker id={i.id} status={i.status} />
        </div>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Grade {i.child_grade}, fall {i.entry_year}{i.current_school ? ` · ${i.current_school}` : ""} · from {i.parent_first_name}{" "}
          {i.parent_last_name} ({i.parent_relationship}) · {when(i.created_at)} · <span className="font-mono">{i.finalsite_external_id}</span>
        </p>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">In their words</h2>
        <p className="mt-2 max-w-2xl font-display text-xl italic text-[var(--color-navy-ink)]">
          {i.one_thing ? `“${i.one_thing}”` : "They didn't add anything."}
        </p>
        {i.interests.length > 0 && <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Interested in {i.interests.join(", ")}</p>}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Formation Pathway</h2>
          <Link href={`/pilot/inquiries/${i.id}/family`} className="text-sm font-medium text-[var(--color-navy-ink)] underline">
            See what the family sees →
          </Link>
        </div>

        {i.consent_pathway && aiAllowed && !signed && <div className="mb-4"><SentToAi {...sentToAi} /></div>}
        {!i.consent_pathway ? (
          <p className="text-sm text-[var(--color-ink-muted)]">This family didn&apos;t ask for a pathway, so none is drafted.</p>
        ) : signed ? (
          <div className="space-y-2 text-sm">
            <p>
              Signed by <span className="font-semibold">{signed.approved_by}</span>, {signed.approved_at ? when(signed.approved_at) : ""}.{" "}
              {signed.pathways.length} {signed.pathways.length === 1 ? "pathway" : "pathways"}: {signed.pathways.map((p) => p.name).join(" · ")}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">Read-only. Sending it to the family comes next (card #29); for now, open the family view.</p>
          </div>
        ) : !aiAllowed ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            AI drafting for real families is off until leadership confirms the Anthropic terms for student data
            (<code>AI_REAL_STUDENTS</code>). Try it on a sample or a demo family.
          </p>
        ) : latestDraft ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-ink-muted)]">
              <span className="font-semibold text-[var(--color-navy-ink)]">Draft</span> from {when(latestDraft.created_at)}
              {latestDraft.used_fallback && " (AI assist was unavailable or too slow: a simple offline draft)"}. Keep the ones that sound like this child, then sign.
            </p>
            <InquiryDraftReview inquiryId={i.id} pathwayId={latestDraft.id} pathways={latestDraft.pathways} />
            <DraftInquiryPathwayButton inquiryId={i.id} again />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Drafted from the family&apos;s own words, their child&apos;s school and interests. Nothing else about them is sent.
            </p>
            <DraftInquiryPathwayButton inquiryId={i.id} again={false} />
          </div>
        )}
      </section>
    </div>
  );
}
