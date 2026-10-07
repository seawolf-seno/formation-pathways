import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, importConfigFromEnv, toFinalsiteCsv, DEFAULT_IMPORT_CONFIG } from "../lib/finalsite-import.ts";

const row = {
  finalsite_external_id: "FP-0A1B2C3D4E5F", created_at: "2026-10-08T17:00:00Z", source: "share", referred_by_code: "AB12CD34",
  parent_first_name: "Pat", parent_last_name: "Rivera", parent_relationship: "Mother", parent_email: "pat@example.com",
  parent_phone: null, address_1: "1 Ocean Ave", address_2: null, city: "Newport Beach", state: "CA", zip: "92660",
  country: "United States", child_first_name: "Sam", child_last_name: "Rivera", child_grade: 9, entry_year: 2027,
  current_school: "Harbor View Middle School", one_thing: "Says \"hi\", fixes bikes,\nand surfs.", interests: ["STEM", "Surf", "Athletics"],
};

test("the Create import has Finalsite's required columns, in order, one row per inquiry", () => {
  const [header, line] = toFinalsiteCsv([row]).trim().split("\r\n");
  assert.equal(
    header,
    "CHILD.external_id,CHILD.first_name,CHILD.last_name,CHILD.grade,CHILD.workflow_year,CHILD.status,PARENT1.first_name,PARENT1.last_name,PARENT1.relationship,PARENT1.email,PARENT1.phone_1_number,HOUSEHOLD1.address_1,HOUSEHOLD1.address_2,HOUSEHOLD1.city,HOUSEHOLD1.state,HOUSEHOLD1.zip,HOUSEHOLD1.country,CHILD.current_school,CHILD.inquiry_interests,CHILD.sports_inquiry_interests_ms"
  );
  assert.equal(line, "FP-0A1B2C3D4E5F,Sam,Rivera,9,2027-2028,Inquiry,Pat,Rivera,Mother,pat@example.com,,1 Ocean Ave,,Newport Beach,CA,92660,United States,Harbor View Middle School,STEM;Athletics,Surf");
});

test("Formation Pathways fields appear only once named, with the school's labels", () => {
  const config = importConfigFromEnv({
    FINALSITE_IMPORT_STATUS: "Inquiry Submitted", FINALSITE_IMPORT_GRADE_LABEL: "Grade {n}",
    FINALSITE_IMPORT_FIELD_ONE_THING: "fp_one_thing", FINALSITE_IMPORT_FIELD_REFERRAL_CODE: "fp_referral_code",
    FINALSITE_IMPORT_FIELD_SOURCE: "fp_inquiry_source", FINALSITE_IMPORT_FIELD_SPORTS: "",
  });
  const csv = toFinalsiteCsv([row], config);
  const [header, line] = csv.split("\r\n");
  assert.ok(header.endsWith("CHILD.current_school,CHILD.inquiry_interests,CHILD.fp_one_thing,CHILD.fp_referral_code,CHILD.fp_inquiry_source"));
  assert.ok(!header.includes("sports"), "an empty setting skips the column");
  assert.ok(line.includes(",Grade 9,2027-2028,Inquiry Submitted,"));
  assert.ok(csv.includes('"Says ""hi"", fixes bikes,\nand surfs."'), "quotes, commas and line breaks survive");
  assert.ok(line.includes(",AB12CD34,Formation Pathways (family share)") || csv.includes(",AB12CD34,Formation Pathways (family share)"));
});

test("a family's text can't become a spreadsheet formula", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1 555"), "'+1 555");
  assert.equal(csvCell("@me"), "'@me");
  assert.equal(csvCell(null), "");
  assert.equal(DEFAULT_IMPORT_CONFIG.status, "Inquiry");
});
