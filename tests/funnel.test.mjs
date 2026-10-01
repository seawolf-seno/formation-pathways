import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateFunnel,
  buildSeasonView,
  dayOfSeason,
  sameDateInSeason,
  seasonOf,
  stageDates,
  suppress,
} from "../lib/sor/funnel.ts";
import { sampleFunnelEvents } from "../lib/sor/importers/finalsite-funnel.ts";
import { envelopeKeys, extractItems, mapFinalsiteContact, schoolYearsOn, signFinalsiteJwt } from "../lib/sor/importers/finalsite-api.ts";
import { createHmac } from "node:crypto";

// Admissions season counts: the only thing that leaves Finalsite is a
// suppressed total. `npm run test:share` (runs alongside the share tests)
const ev = (over) => ({ entryYear: 2027, inquiredOn: null, appliedOn: null, admittedOn: null, enrolledOn: null, ...over });

test("seasons run Aug 1 to Jul 31 and are named by entry year", () => {
  assert.equal(seasonOf("2026-07-31"), 2026);
  assert.equal(seasonOf("2026-08-01"), 2027);
  assert.equal(dayOfSeason("2026-08-01"), 0);
  assert.equal(sameDateInSeason("2026-10-05", 2026), "2025-10-05");
  assert.equal(sameDateInSeason("2028-02-29", 2027), "2027-02-28");
});

test("counts of 1–4 are suppressed; 0 and 5+ are kept", () => {
  assert.deepEqual([0, 1, 4, 5, 90].map(suppress), [0, null, null, 5, 90]);
});

test("a later stage implies the earlier ones", () => {
  const d = stageDates(ev({ admittedOn: "2027-03-10", appliedOn: "2026-12-01" }));
  assert.equal(d.inquiry, "2026-12-01");
  assert.equal(d.application, "2026-12-01");
  assert.equal(d.enrolled, null);
});

test("aggregates are cumulative, suppressed, and carry no identity", () => {
  const events = Array.from({ length: 12 }, (_, i) => ev({ inquiredOn: i < 3 ? "2026-08-10" : "2026-09-20" }));
  const rows = aggregateFunnel(events, [2027], "2026-09-27");
  const inq = rows.filter((r) => r.stage === "inquiry");
  assert.equal(inq.find((r) => r.asOf === "2026-08-15").count, null); // 3 → suppressed
  assert.equal(inq.find((r) => r.asOf === "2026-09-27").count, 12);
  assert.ok(rows.every((r) => Object.keys(r).sort().join() === "asOf,cohort,count,entryYear,stage"));
  assert.ok(rows.every((r) => r.count == null || r.count === 0 || r.count >= 5));
});

test("the view compares this season with past seasons on the same date", () => {
  const events = sampleFunnelEvents([
    { entryYear: 2026, inquiries: 100, applications: 60, admitted: 50, enrolled: 30 },
    { entryYear: 2027, inquiries: 100, applications: 60, admitted: 50, enrolled: 30 },
  ]);
  const view = buildSeasonView(aggregateFunnel(events, [2027, 2026], "2026-10-05"), "2026-10-05");
  assert.equal(view.current.entryYear, 2027);
  assert.equal(view.prior[0].entryYear, 2026);
  assert.equal(view.current.final, null);
  assert.equal(view.prior[0].final.enrolled, 30);
  assert.equal(view.prior[0].final.inquiry, 100);
  // Nothing after today leaks into this season's chart.
  assert.ok(view.series.find((s) => s.isCurrent).points.inquiry.every((p) => p.day <= dayOfSeason("2026-10-05")));
});

test("sample events keep stages in order", () => {
  for (const e of sampleFunnelEvents()) {
    const d = [e.inquiredOn, e.appliedOn, e.admittedOn, e.enrolledOn].filter(Boolean);
    assert.deepEqual(d, [...d].sort());
  }
});

test("a Finalsite contact maps to dates and a year only", () => {
  const { event, missing } = mapFinalsiteContact({
    id: 991, first_name: "Should", last_name: "Vanish", email: "p@example.com",
    prospect_entry_year: { name: "2027-2028", start_year: 2027 }, school_year: { start_year: 2026 }, inquiry_submit_date: "2026-09-02T14:00:00Z", application_submit_date: "2026-12-01",
  });
  assert.deepEqual(event, { entryYear: 2027, inquiredOn: "2026-09-02", appliedOn: "2026-12-01", admittedOn: null, enrolledOn: null });
  assert.deepEqual(missing, ["admittedOn", "enrolledOn"]);
  assert.equal(mapFinalsiteContact({ inquiry_date: "2026-09-02" }).event, null); // no year → not counted
  // prospect_entry_year blank → the contact's school_year; a label alone works too
  assert.equal(mapFinalsiteContact({ prospect_entry_year: null, school_year: { start_year: 2027 } }).event.entryYear, 2027);
  assert.equal(mapFinalsiteContact({ school_year: { name: "2027-2028" } }).event.entryYear, 2027);
});

test("the Finalsite JWT is HS256 with sub, name and a short exp", () => {
  const jwt = signFinalsiteJwt("cred-1", "s3cret", 1_800_000_000);
  const [h, b, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "HS256", typ: "JWT" });
  const body = JSON.parse(Buffer.from(b, "base64url"));
  assert.equal(body.sub, "cred-1");
  assert.equal(body.iat, 1_800_000_000);
  assert.ok(body.exp - 1_800_000_000 <= 3600);
  assert.equal(sig, createHmac("sha256", "s3cret").update(`${h}.${b}`).digest("base64url"));
});

test("Finalsite pages are read from a bare array or any envelope key, and the shape reports names only", () => {
  const c = { id: 1 };
  assert.deepEqual(extractItems([c]), [c]);
  assert.deepEqual(extractItems({ data: [c], meta: {} }), [c]);
  assert.deepEqual(extractItems({ meta: { next_cursor: "x" }, records: [c] }), [c]);
  assert.deepEqual(extractItems({ meta: {} }), []);
  assert.deepEqual(envelopeKeys({ records: [c], total: 0, meta: { next_cursor: "x" } }), ["records[]", "total", "meta", "meta.next_cursor"]);
});

test("a season pulled by school_year_id keeps its year even when the contact's year fields are blank", () => {
  const { event, missing } = mapFinalsiteContact({ prospect_entry_year: null, inquiry_submit_date: "2026-10-01" }, 2027);
  assert.deepEqual(event, { entryYear: 2027, inquiredOn: "2026-10-01", appliedOn: null, admittedOn: null, enrolledOn: null });
  assert.ok(!missing.includes("entryYear"));
});

test("school years are read off the year objects a contact carries", () => {
  const ys = schoolYearsOn({
    school_year: { id: "a", name: "2026-2027", start_year: 2026 },
    prospect_entry_year: { id: "b", name: "2027-2028" },
    track_attributes: [{ school_year: { id: "c", start_year: 2025, name: "2025-2026" } }, { school_year: null }],
  });
  assert.deepEqual(ys.map((y) => [y.id, y.startYear]), [["a", 2026], ["b", 2027], ["c", 2025]]);
  assert.deepEqual(schoolYearsOn({ school_year: null }), []);
});
