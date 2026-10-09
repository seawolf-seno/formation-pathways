import { test } from "node:test";
import assert from "node:assert/strict";
import { inquiryReport, shownCount } from "../lib/inquiry-report.ts";

test("small counts are hidden, zero and five or more are shown", () => {
  assert.equal(shownCount(0), "0");
  assert.equal(shownCount(1), "fewer than 5");
  assert.equal(shownCount(4), "fewer than 5");
  assert.equal(shownCount(5), "5");
});

test("real families and samples are counted apart", () => {
  const inq = (id, extra = {}) => ({ id, is_sample: false, status: "new", source: "website", consent_pathway: true, ...extra });
  const inquiries = [
    inq("a"), inq("b", { source: "share", status: "applied" }), inq("c", { consent_pathway: false, source: "direct" }),
    inq("s", { is_sample: true, source: "share", status: "applied" }),
  ];
  const activity = { signed: new Set(["a", "b", "s"]), linked: new Set(["a"]), shared: new Set(["a", "s"]) };
  const referrals = [
    { referred_inquiry_id: "b", is_sample: false, status: "sent" },
    { referred_inquiry_id: "s", is_sample: true, status: "approved" },
  ];
  const real = Object.fromEntries(inquiryReport(inquiries, activity, referrals, false).map((r) => [r.label, r.count]));
  assert.equal(real["Inquiries"], 3);
  assert.equal(real["From the school website"], 1);
  assert.equal(real["Asked for a Formation Pathway"], 2);
  assert.equal(real["Pathway signed"], 2);
  assert.equal(real["Shared a pathway"], 1);
  assert.equal(real["Inquired through a family's link"], 1);
  assert.equal(real["…of them through a family's link"], 1);
  assert.equal(real["Thank-yous sent"], 1);
  const samples = Object.fromEntries(inquiryReport(inquiries, activity, referrals, true).map((r) => [r.label, r.count]));
  assert.equal(samples["Inquiries"], 1);
  assert.equal(samples["Referrals confirmed"], 1);
  assert.equal(samples["Thank-yous sent"], 0);
});
