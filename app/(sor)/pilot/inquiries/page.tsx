import Link from "next/link";
import { redirect } from "next/navigation";
import { getInquiries, getPilotSettings, logAccess, requireStaff } from "@/lib/sor/queries";
import { requestOrigin } from "@/lib/origin";
import { CopySnippet, InquiriesSwitch, InquiryStatusPicker, SampleInquiryButton } from "@/components/sor/InquiryControls";

export const metadata = { title: "Inquiries · Formation Pathways" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Families' inquiries from /discover (Fizzy #29): the switch that opens the
 * public form, the link and embed code for the school website, the Finalsite
 * Create-import export, and the inbox. Admin and admissions only (RLS).
 */
export default async function InquiriesPage() {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const isAdmin = staff.role === "admin";
  const [settings, inquiries, origin] = await Promise.all([getPilotSettings(), getInquiries(), requestOrigin()]);
  await logAccess(staff, "view_inquiries", null, { count: inquiries.length });

  const real = inquiries.filter((i) => !i.is_sample);
  const waiting = real.filter((i) => !i.finalsite_exported_at).length;
  const samples = inquiries.length - real.length;
  // How many inquiries each family's share code brought in.
  const referrals = new Map<string, number>();
  for (const i of inquiries) if (i.referred_by_code) referrals.set(i.referred_by_code, (referrals.get(i.referred_by_code) ?? 0) + 1);
  const byCode = new Map(inquiries.map((i) => [i.share_code, i]));

  const link = `${origin}/discover?src=website`;
  const embed = `<iframe src="${origin}/discover?src=website&embed=1" title="Discover Pacifica" width="100%" height="1600" style="border:0;max-width:100%"></iframe>`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/pilot" className="text-xs text-[var(--color-ink-muted)] hover:underline">← Pilot</Link>
        <h1 className="mt-2 font-display text-3xl text-[var(--color-navy-ink)]">Inquiries</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-muted)]">
          Families who tell us about their child at /discover. Admissions sends them on to Finalsite with an import file,
          matched by each inquiry&apos;s FP id. What a family sent can&apos;t be edited; only its follow-up can.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="The form">
          {isAdmin ? (
            <InquiriesSwitch settings={settings} />
          ) : (
            <p className="text-sm">{settings.inquiries_open ? "Open." : "Closed until an admin opens it."}</p>
          )}
          <div className="mt-4 space-y-3">
            <CopySnippet label="Link for the school website" text={link} />
            <CopySnippet label="Or embed it on a website page" text={embed} />
            <p className="text-xs text-[var(--color-ink-muted)]">
              Framing is allowed on pacificachristian.org only. A family&apos;s shared pathway links here with its own code
              (/discover?ref=CODE), which is how referrals are credited.
            </p>
          </div>
        </Section>

        <Section title="Send to Finalsite">
          <p className="text-sm">
            <span className="font-display text-2xl text-[var(--color-navy-ink)]">{waiting}</span>{" "}
            {waiting === 1 ? "inquiry hasn't" : "inquiries haven't"} been sent to Finalsite yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form method="post" action="/pilot/inquiries/export">
              <input type="hidden" name="scope" value="new" />
              <button className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!waiting}>
                Download new inquiries
              </button>
            </form>
            <form method="post" action="/pilot/inquiries/export">
              <input type="hidden" name="scope" value="all" />
              <button className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50" disabled={!real.length}>
                Download all again
              </button>
            </form>
            {samples > 0 && (
              <form method="post" action="/pilot/inquiries/export">
                <input type="hidden" name="scope" value="samples" />
                <button className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-ink-muted)]">
                  Preview the file with samples
                </button>
              </form>
            )}
            {isAdmin && <SampleInquiryButton />}
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-[var(--color-ink-muted)]">
            <li>Download the new inquiries. They&apos;re marked as sent so they won&apos;t come twice.</li>
            <li>In Finalsite: Settings → Import Data → Create, choose the file, and use the saved mapping template.</li>
            <li>Each child&apos;s external id is their FP id, so the same family is never created twice.</li>
          </ol>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Samples are never in a real export. The sample preview is for checking the file; don&apos;t import it.
          </p>
        </Section>
      </div>

      <Section title={`Inbox (${inquiries.length})`}>
        {inquiries.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No inquiries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-widest text-[var(--color-ink-muted)]">
                  <th className="py-2 pr-3 font-semibold">Received</th>
                  <th className="py-2 pr-3 font-semibold">Child</th>
                  <th className="py-2 pr-3 font-semibold">Parent</th>
                  <th className="py-2 pr-3 font-semibold">Came from</th>
                  <th className="py-2 pr-3 font-semibold">Finalsite</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((i) => {
                  const referrer = i.referred_by_code ? byCode.get(i.referred_by_code) : undefined;
                  const brought = referrals.get(i.share_code) ?? 0;
                  return (
                    <tr key={i.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                      <td className="py-3 pr-3 tabular-nums">
                        {day(i.created_at)}
                        {i.is_sample && <span className="ml-1 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">Sample</span>}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-medium text-[var(--color-navy-ink)]">{i.child_first_name} {i.child_last_name}</span>
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          Grade {i.child_grade}, fall {i.entry_year}{i.current_school ? ` · ${i.current_school}` : ""}
                        </span>
                        {i.one_thing && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-[var(--color-ink-muted)]">In their words</summary>
                            <p className="mt-1 max-w-sm font-display text-sm italic">“{i.one_thing}”</p>
                          </details>
                        )}
                        {i.interests.length > 0 && <span className="block text-xs text-[var(--color-ink-muted)]">{i.interests.join(", ")}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        {i.parent_first_name} {i.parent_last_name}
                        <span className="block text-xs text-[var(--color-ink-muted)]">{i.parent_relationship} · {i.parent_email}</span>
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          {i.consent_pathway ? "Wants a pathway" : "No pathway requested"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        {i.source === "share"
                          ? <>Shared by {referrer ? `${referrer.parent_first_name} ${referrer.parent_last_name}` : "a family"} <span className="text-[var(--color-ink-muted)]">({i.referred_by_code})</span></>
                          : i.source === "website" ? "School website" : "Direct link"}
                        {brought > 0 && <span className="mt-1 block font-semibold text-[var(--color-navy-ink)]">Brought {brought} {brought === 1 ? "family" : "families"}</span>}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <span className="font-mono">{i.finalsite_external_id}</span>
                        <span className="block text-[var(--color-ink-muted)]">
                          {i.is_sample ? "never sent" : i.finalsite_exported_at ? `sent ${day(i.finalsite_exported_at)}` : "not sent yet"}
                        </span>
                      </td>
                      <td className="py-3"><InquiryStatusPicker id={i.id} status={i.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
