// The counts-only report on /pilot/inquiries (card #29): how many families
// inquired, got a signed pathway, shared it, and brought another family.
// Like /season, only counts: no names, and any count from 1 to 4 is shown as
// "fewer than 5" so a small group can't point to a family. Samples are
// counted separately and never mixed in. Pure; tested in tests/inquiry-report.test.mjs.

export const SMALLEST_SHOWN = 5;

export interface ReportInquiry {
  id: string;
  is_sample: boolean;
  status: string;
  source: string;
  consent_pathway: boolean;
}

export interface ReportReferral {
  referred_inquiry_id: string;
  is_sample: boolean;
  status: string;
}

export interface ReportRow {
  label: string;
  count: number;
}

/** "fewer than 5" for 1–4; zero and five or more as they are. */
export function shownCount(n: number): string {
  return n > 0 && n < SMALLEST_SHOWN ? `fewer than ${SMALLEST_SHOWN}` : String(n);
}

export function inquiryReport(
  inquiries: ReportInquiry[],
  activity: { signed: Set<string>; linked: Set<string>; shared: Set<string> },
  referrals: ReportReferral[],
  samples: boolean,
): ReportRow[] {
  const mine = inquiries.filter((i) => i.is_sample === samples);
  const ids = new Set(mine.map((i) => i.id));
  const has = (set: Set<string>) => mine.filter((i) => set.has(i.id)).length;
  const refs = referrals.filter((r) => r.is_sample === samples && ids.has(r.referred_inquiry_id));
  const applied = (i: ReportInquiry) => i.status === "applied" || i.status === "enrolled";
  const referred = mine.filter((i) => i.source === "share");
  return [
    { label: "Inquiries", count: mine.length },
    { label: "From the school website", count: mine.filter((i) => i.source === "website").length },
    { label: "Asked for a Formation Pathway", count: mine.filter((i) => i.consent_pathway).length },
    { label: "Pathway signed", count: has(activity.signed) },
    { label: "Sent their family link", count: has(activity.linked) },
    { label: "Shared a pathway", count: has(activity.shared) },
    { label: "Inquired through a family's link", count: referred.length },
    { label: "Referrals confirmed", count: refs.filter((r) => r.status !== "declined").length },
    { label: "Applied or enrolled", count: mine.filter(applied).length },
    { label: "…of them through a family's link", count: referred.filter(applied).length },
    { label: "Thank-yous sent", count: refs.filter((r) => r.status === "sent").length },
  ];
}
