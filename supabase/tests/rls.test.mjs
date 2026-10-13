import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

// Guardrail tests for the system-of-record migration: consent gates, the
// leadership real-data gate, role-based RLS, append-only access log. Runs the
// real migrations in PGlite (Postgres in WASM) on a stub of Supabase's auth
// schema. `npm run test:db`
const here = import.meta.dirname;
const migrations = path.join(here, "../migrations");
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(here, "auth-stub.sql"), "utf8"));
for (const f of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(fs.readFileSync(path.join(migrations, f), "utf8"));
}
const ids = { admin: "00000000-0000-0000-0000-00000000000a", adm: "00000000-0000-0000-0000-00000000000b", teach: "00000000-0000-0000-0000-00000000000c", stranger: "00000000-0000-0000-0000-00000000000d", leaver: "00000000-0000-0000-0000-00000000000e" };
await db.exec(`insert into auth.users values ('${ids.admin}','a@pacificachristian.org'),('${ids.adm}','b@pacificachristian.org'),('${ids.teach}','c@pacificachristian.org'),('${ids.stranger}','d@gmail.com'),('${ids.leaver}','e@pacificachristian.org');
insert into staff values ('${ids.admin}','a@pacificachristian.org','Admin','admin'),('${ids.adm}','b@pacificachristian.org','Adm','admissions'),('${ids.teach}','c@pacificachristian.org','Teach','teacher'),('${ids.leaver}','e@pacificachristian.org','Leaver','teacher');`);
let pass = 0, fail = 0;
async function as(who, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who] ?? ""}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
async function expect(name, who, sql, ok, check) {
  let r, err;
  try { r = await as(who, sql); } catch (e) { err = e; }
  const good = ok ? !err && (!check || check(r)) : !!err || (check && check(r));
  if (good) pass++; else fail++;
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${err ? "  (" + err.message.slice(0, 90) + ")" : ""}`);
}
await expect("non-pacifica email cannot be staff", "admin", `insert into staff values ('${ids.stranger}','d@gmail.com','X','admin')`, false);
await expect("admin can add SAMPLE person with gate off", "admin", `insert into people (first_name,last_name,stage,is_sample) values ('Sam','Ple','applicant',true) returning id`, true);
await expect("admin CANNOT add real person with gate off", "admin", `insert into people (first_name,last_name,stage) values ('Real','Kid','enrolled')`, false);
await expect("gate cannot open without approver", "admin", `update pilot_settings set real_data_enabled=true`, false);
await expect("teacher cannot open gate", "teach", `update pilot_settings set real_data_enabled=true, approved_by='x', approval_reference='y', approved_at=now() returning *`, true, r => r.rows.length === 0);
await expect("admin opens gate with approver", "admin", `update pilot_settings set real_data_enabled=true, approved_by='Head of School', approval_reference='Leadership mtg 2026-10-01', approved_at=now() returning *`, true, r => r.rows.length === 1);
await expect("admin adds real person after sign-off", "admin", `insert into people (id,first_name,last_name,stage) values ('11111111-1111-1111-1111-111111111111','Real','Kid','enrolled')`, true);
await expect("a real student can't be turned into a sample", "admin", `update people set is_sample = true where id = '11111111-1111-1111-1111-111111111111'`, false);
await expect("a sample can't be turned into a real student", "admin", `update people set is_sample = false where is_sample`, false);
await expect("admin links a Blackbaud id after adding someone", "admin", `insert into external_ids (person_id, system, external_id) values ('11111111-1111-1111-1111-111111111111','blackbaud','4400123') returning *`, true, r => r.rows.length === 1);
await expect("admin changes that id later", "admin", `update external_ids set external_id = '4400124' where person_id = '11111111-1111-1111-1111-111111111111' and system = 'blackbaud' returning *`, true, r => r.rows.length === 1);
await expect("admissions cannot change external ids", "adm", `update external_ids set external_id = '9' where person_id = '11111111-1111-1111-1111-111111111111' returning *`, true, r => r.rows.length === 0);
await expect("teacher cannot add external ids", "teach", `insert into external_ids (person_id, system, external_id) values ('11111111-1111-1111-1111-111111111111','canvas','77')`, false);
await expect("one Blackbaud id can't belong to two people", "admin", `insert into external_ids (person_id, system, external_id) select id, 'blackbaud', '4400124' from people where is_sample limit 1`, false);
await expect("class history without consent blocked", "admin", `insert into course_history (person_id, section_id, school_year, course_title) values ('11111111-1111-1111-1111-111111111111','s1','2025-2026','Biology')`, false);
await expect("import without consent blocked", "admin", `insert into enrollments (person_id, grade) values ('11111111-1111-1111-1111-111111111111', 10)`, false);
await expect("observation without consent blocked", "teach", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('11111111-1111-1111-1111-111111111111','${ids.teach}','T','x','x')`, false);
await expect("teacher cannot record consent", "teach", `insert into consents (person_id, scope, granted_by, granted_on, evidence) values ('11111111-1111-1111-1111-111111111111','import_records','Parent','2026-09-30','form')`, false);
await expect("admin records consents", "admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) select '11111111-1111-1111-1111-111111111111', s, 'Parent Kid', '2026-09-30', 'Signed form, admissions office', '${ids.admin}' from unnest(enum_range(null::consent_scope)) s`, true);
await expect("class history with consent works", "admin", `insert into course_history (person_id, section_id, school_year, course_title, offering_type) values ('11111111-1111-1111-1111-111111111111','s1','2025-2026','Biology','Academics')`, true);
await expect("teacher reads class history", "teach", `select * from course_history`, true, r => r.rows.length === 1);
await expect("teacher cannot write class history", "teach", `insert into course_history (person_id, section_id, school_year, course_title) values ('11111111-1111-1111-1111-111111111111','s2','2025-2026','Art')`, false);
await expect("non-staff cannot read class history", "stranger", `select * from course_history`, true, r => r.rows.length === 0);
await expect("import with consent works", "admin", `insert into enrollments (person_id, grade) values ('11111111-1111-1111-1111-111111111111', 10)`, true);
await expect("admissions record import works", "admin", `insert into admissions_records (person_id, previous_school) values ('11111111-1111-1111-1111-111111111111', 'Somewhere MS')`, true);
await expect("teacher CANNOT read admissions records", "teach", `select * from admissions_records`, true, r => r.rows.length === 0);
await expect("admissions CAN read admissions records", "adm", `select * from admissions_records`, true, r => r.rows.length === 1);
await expect("non-staff sees no people", "stranger", `select * from people`, true, r => r.rows.length === 0);
await expect("teacher sees people", "teach", `select * from people`, true, r => r.rows.length === 2);
await expect("teacher cannot write observation as someone else", "teach", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('11111111-1111-1111-1111-111111111111','${ids.adm}','T','x','x')`, false);
await expect("teacher writes own observation", "teach", `insert into observations (person_id, author_id, author_name, raw_text, body, tags) values ('11111111-1111-1111-1111-111111111111','${ids.teach}','T','x','x','{Love of Neighbor}')`, true);
await expect("bad tag rejected", "teach", `insert into observations (person_id, author_id, author_name, raw_text, body, tags) values ('11111111-1111-1111-1111-111111111111','${ids.teach}','T','x','x','{GPA}')`, false);
await expect("teacher cannot generate pathway draft", "teach", `insert into pathway_drafts (person_id, portrait, pathways, generated_by) values ('11111111-1111-1111-1111-111111111111','p','[]','${ids.teach}')`, false);
await expect("admissions generates pathway draft", "adm", `insert into pathway_drafts (person_id, portrait, pathways, generated_by) values ('11111111-1111-1111-1111-111111111111','p','[]','${ids.adm}')`, true);
await expect("admissions edits an unsigned draft", "adm", `update pathway_drafts set portrait = 'p2' where status = 'draft' returning id`, true, r => r.rows.length === 1);
await expect("a draft can't move to another student", "adm", `update pathway_drafts set person_id = (select id from people where is_sample limit 1)`, false);
await expect("a draft's author can't be changed", "adm", `update pathway_drafts set generated_by = '${ids.admin}'`, false);
await expect("signing records the signer's own name", "adm", `update pathway_drafts set status = 'approved', approved_by = 'Head of School' returning approved_by`, true, r => r.rows[0]?.approved_by === "Adm");
await expect("a signed draft is read-only", "adm", `update pathway_drafts set portrait = 'rewritten'`, false);
await expect("a signed draft can't be un-signed", "admin", `update pathway_drafts set status = 'draft'`, false);
await expect("staff logs access", "teach", `insert into access_log (staff_id, action, person_id) values ('${ids.teach}','view_person','11111111-1111-1111-1111-111111111111')`, true);
await expect("access log cannot be deleted by admin", "admin", `delete from access_log returning *`, true, r => r.rows.length === 0);
await expect("teacher cannot read access log", "teach", `select * from access_log`, true, r => r.rows.length === 0);
await expect("revoked consent blocks new observation", "admin", `update consents set revoked_at=now() where scope='staff_observations'`, true);
await expect("...observation now blocked", "teach", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('11111111-1111-1111-1111-111111111111','${ids.teach}','T','x','x')`, false);
// Student voice (sparks): needs the student_voice consent, written as yourself.
const spk = (who) => `insert into student_sparks (person_id, sparks, created_by) values ('11111111-1111-1111-1111-111111111111', '{"answers":[]}', '${ids[who]}')`;
await expect("admin revokes student_voice", "admin", `update consents set revoked_at = now() where scope = 'student_voice' and revoked_at is null returning *`, true, r => r.rows.length === 1);
await expect("sparks refused without student_voice consent", "teach", spk("teach"), false);
await expect("admin records student_voice consent", "admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) values ('11111111-1111-1111-1111-111111111111','student_voice','Parent Kid','2026-10-04','Signed form','${ids.admin}')`, true);
await expect("teacher saves a student's sparks as themselves", "teach", spk("teach"), true);
await expect("nobody saves sparks as someone else", "teach", `insert into student_sparks (person_id, sparks, created_by) values ('11111111-1111-1111-1111-111111111111', '{}', '${ids.admin}')`, false);
await expect("staff can't label their own session as sent from home", "teach", `insert into student_sparks (person_id, sparks, created_by, source) values ('11111111-1111-1111-1111-111111111111', '{"answers":[]}', '${ids.teach}', 'family_link')`, false);
await expect("admissions reads sparks", "adm", `select * from student_sparks`, true, r => r.rows.length === 1);
await expect("non-staff cannot read sparks", "stranger", `select * from student_sparks`, true, r => r.rows.length === 0);
// Class reflections (what they enjoy about their classes): the same rules as sparks.
const refl = (who, body = `{"classes":[{"key":"blackbaud:s1","title":"Biology","loved":true}]}`) => `insert into class_reflections (person_id, reflections, created_by) values ('11111111-1111-1111-1111-111111111111', '${body}', '${ids[who]}') returning id`;
await expect("admin revokes student_voice again", "admin", `update consents set revoked_at = now() where scope = 'student_voice' and revoked_at is null returning *`, true, r => r.rows.length === 1);
await expect("class reflections refused without student_voice consent", "teach", refl("teach"), false);
await expect("admin records student_voice consent again", "admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) values ('11111111-1111-1111-1111-111111111111','student_voice','Parent Kid','2026-10-09','Signed form','${ids.admin}')`, true);
await expect("teacher saves a student's class reflections as themselves", "teach", refl("teach"), true);
await expect("nobody saves class reflections as someone else", "teach", refl("admin"), false);
await expect("non-staff cannot save class reflections", "stranger", refl("stranger"), false);
await expect("a payload that isn't a list of classes is refused", "teach", refl("teach", `{"classes":"Biology"}`), false);
await expect("a saved reflection can't be rewritten", "admin", `update class_reflections set reflections = '{"classes":[]}' returning id`, true, r => r.rows.length === 0);
await expect("admissions reads class reflections", "adm", `select * from class_reflections`, true, r => r.rows.length === 1);
await expect("non-staff cannot read class reflections", "stranger", `select * from class_reflections`, true, r => r.rows.length === 0);
await expect("teacher cannot delete class reflections", "teach", `delete from class_reflections returning id`, true, r => r.rows.length === 0);
// Class resources (links students suggest for their classes): saved unreviewed, approved by a teacher or admin.
const plainStaff = "00000000-0000-0000-0000-0000000000f1";
await db.exec(`insert into auth.users values ('${plainStaff}','f@pacificachristian.org'); insert into staff values ('${plainStaff}','f@pacificachristian.org','Plain','staff');`);
ids.plain = plainStaff;
const KID = "11111111-1111-1111-1111-111111111111";
const res = (who, extra = {}) => {
  const row = { person_id: KID, class_title: "Spanish III", title: "Verb drills", url: "https://example.org/verbs", kind: "Practice", created_by: ids[who], ...extra };
  return `insert into class_resources (${Object.keys(row).join(", ")}) values (${Object.values(row).map((v) => `'${v}'`).join(", ")}) returning id, status, class_key`;
};
await expect("admin revokes student_voice once more", "admin", `update consents set revoked_at = now() where scope = 'student_voice' and revoked_at is null returning *`, true, r => r.rows.length === 1);
await expect("a suggested resource is refused without student_voice consent", "plain", res("plain"), false);
await expect("admin records student_voice consent once more", "admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) values ('${KID}','student_voice','Parent Kid','2026-10-10','Signed form','${ids.admin}')`, true);
await expect("any staff member saves a student's suggestion, unreviewed", "plain", res("plain"), true, r => r.rows[0].status === "pending" && r.rows[0].class_key === "spanish iii");
await expect("nobody saves a suggestion as someone else", "plain", res("teach"), false);
await expect("a suggestion can't arrive already approved", "teach", res("teach", { status: "approved" }), false);
await expect("...or with a reviewer filled in", "teach", res("teach", { reviewed_by_name: "Head of School" }), false);
await expect("a link that isn't https is refused", "teach", res("teach", { url: "http://example.org/verbs" }), false);
await expect("a script link is refused", "teach", res("teach", { url: "javascript:alert(1)" }), false);
await expect("a link with sign-in details in it is refused", "teach", res("teach", { url: "https://user:pw@example.org/" }), false);
await expect("a link with @ in its path is fine", "teach", res("teach", { url: "https://www.youtube.com/@channel", title: "A channel" }), true);
await expect("a kind the app doesn't have is refused", "teach", res("teach", { kind: "Grades" }), false);
await expect("non-staff cannot suggest", "stranger", res("stranger"), false);
await expect("plain staff see the unreviewed one they saved, not anyone else's", "plain", `select title from class_resources`, true, r => r.rows.length === 1 && r.rows[0].title === "Verb drills");
await expect("a teacher sees them", "teach", `select * from class_resources`, true, r => r.rows.length === 2);
await expect("plain staff can't approve", "plain", `update class_resources set status = 'approved' returning id`, true, r => r.rows.length === 0);
await expect("admissions can read but not approve", "adm", `update class_resources set status = 'approved' returning id`, true, r => r.rows.length === 0);
await expect("a teacher approves one, and is recorded as the reviewer", "teach", `update class_resources set status = 'approved', reviewed_by_name = 'Head of School' where title = 'Verb drills' returning reviewed_by, reviewed_by_name, reviewed_at`, true, r => r.rows.length === 1 && r.rows[0].reviewed_by === ids.teach && r.rows[0].reviewed_by_name === "Teach" && r.rows[0].reviewed_at !== null);
await expect("the link can't be changed in a review", "teach", `update class_resources set url = 'https://example.org/elsewhere' where title = 'Verb drills'`, false);
await expect("...nor the class", "teach", `update class_resources set class_title = 'Physics' where title = 'Verb drills'`, false);
await expect("...nor the student", "admin", `update class_resources set person_id = (select id from people where is_sample limit 1) where title = 'Verb drills'`, false);
await expect("a reviewed suggestion can't go back to unreviewed", "teach", `update class_resources set status = 'pending' where title = 'Verb drills'`, false);
await expect("tidying the title keeps the original reviewer", "admin", `update class_resources set title = 'Verb drills (preterite)' where title = 'Verb drills' returning reviewed_by_name`, true, r => r.rows[0]?.reviewed_by_name === "Teach");
await expect("plain staff still don't see the other unreviewed one", "plain", `select status from class_resources`, true, r => r.rows.length === 1 && r.rows[0].status === "approved");
await expect("a teacher approves the other; every staff member sees approved ones", "leaver", `update class_resources set status = 'approved' where title = 'A channel' returning id`, true, r => r.rows.length === 1);
await expect("...including plain staff", "plain", `select status from class_resources`, true, r => r.rows.length === 2 && r.rows.every((x) => x.status === "approved"));
await expect("an admin takes one down, and that is recorded too", "admin", `update class_resources set status = 'declined' where title = 'A channel' returning reviewed_by_name`, true, r => r.rows[0]?.reviewed_by_name === "Admin");
await expect("a declined one is hidden from plain staff who didn't save it", "plain", `select title from class_resources`, true, r => r.rows.length === 1 && r.rows[0].title.startsWith("Verb drills"));
await expect("non-staff cannot read suggestions", "stranger", `select * from class_resources`, true, r => r.rows.length === 0);
await expect("a teacher cannot delete a suggestion", "teach", `delete from class_resources returning id`, true, r => r.rows.length === 0);
// At-home Spark links: the one anonymous write path. Write-only, once, expiring.
async function asAnon(sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
async function expectAnon(name, sql, ok, check) {
  let r, err;
  try { r = await asAnon(sql); } catch (e) { err = e; }
  const good = ok ? !err && (!check || check(r)) : !!err || (check && check(r));
  if (good) pass++; else fail++;
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${err ? "  (" + err.message.slice(0, 90) + ")" : ""}`);
}
const hash = (t) => `encode(sha256(convert_to('${t}', 'UTF8')), 'hex')`;
const link = (who, t, extra = "") => `insert into spark_links (person_id, token_hash, first_name, created_by${extra ? ", expires_at" : ""}) values ('11111111-1111-1111-1111-111111111111', ${hash(t)}, 'Real', '${ids[who]}'${extra ? `, ${extra}` : ""}) returning id`;
await expect("staff makes an at-home link as themselves", "teach", link("teach", "tok-good"), true, r => r.rows.length === 1);
await expect("nobody makes a link as someone else", "teach", link("admin", "tok-x"), false);
await expect("non-staff cannot make a link", "stranger", link("stranger", "tok-y"), false);
await expect("an expired link can be stored", "admin", link("admin", "tok-old", "now() - interval '1 day'"), true);
await expect("a link can't last more than 30 days", "teach", link("teach", "tok-long", "now() + interval '40 days'"), false);
await expect("an old created_at can't stretch a link", "teach", `insert into spark_links (person_id, token_hash, first_name, created_by, created_at, expires_at) values ('11111111-1111-1111-1111-111111111111', ${hash("tok-2099")}, 'Real', '${ids.teach}', '2099-01-01', '2099-01-20')`, false);
await expect("a staff member who'll leave makes a link", "leaver", link("leaver", "tok-leaver"), true, r => r.rows.length === 1);
await expect("admin deactivates them", "admin", `update staff set active = false where user_id = '${ids.leaver}' returning user_id`, true, r => r.rows.length === 1);
await expectAnon("anon gets only the first name for a good link", `select * from spark_link_greeting('tok-good')`, true, r => r.rows.length === 1 && r.rows[0].first_name === "Real" && Object.keys(r.rows[0]).length === 2);
await expectAnon("anon gets nothing for a wrong token", `select * from spark_link_greeting('tok-guess')`, true, r => r.rows.length === 0);
await expectAnon("anon gets nothing for an expired link", `select * from spark_link_greeting('tok-old')`, true, r => r.rows.length === 0);
await expectAnon("a deactivated staff member's link stops working", `select * from spark_link_greeting('tok-leaver')`, true, r => r.rows.length === 0);
await expectAnon("...and can't submit", `select spark_link_submit('tok-leaver', '{"answers":[]}'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expectAnon("anon cannot read the links table", `select * from spark_links`, false, r => r.rows.length === 0);
await expectAnon("anon cannot read sparks", `select * from student_sparks`, false, r => r.rows.length === 0);
await expectAnon("anon cannot read class reflections", `select * from class_reflections`, false, r => r.rows.length === 0);
await expectAnon("anon cannot read suggested resources", `select * from class_resources`, false, r => r.rows.length === 0);
await expectAnon("anon cannot suggest a resource", `insert into class_resources (person_id, class_title, title, url, kind, created_by) values ('11111111-1111-1111-1111-111111111111', 'Spanish III', 'x', 'https://example.org/', 'Practice', '${ids.teach}')`, false);
await expectAnon("anon cannot write class reflections", `insert into class_reflections (person_id, reflections, created_by) values ('11111111-1111-1111-1111-111111111111', '{"classes":[]}', '${ids.teach}')`, false);
await expectAnon("anon cannot write sparks directly", `insert into student_sparks (person_id, sparks, created_by) values ('11111111-1111-1111-1111-111111111111', '{}', '${ids.teach}')`, false);
await expectAnon("anon cannot call other private helpers", `select private.has_role('admin')`, false);
await expectAnon("a non-object payload is refused", `select spark_link_submit('tok-good', '[1,2]'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expectAnon("a payload with keys the app never writes is refused", `select spark_link_submit('tok-good', '{"answers":[],"evil":1}'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expectAnon("a payload whose lists aren't lists is refused", `select spark_link_submit('tok-good', '{"answers":"x"}'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expectAnon("the family submits sparks once", `select spark_link_submit('tok-good', '{"answers":[]}'::jsonb) as ok`, true, r => r.rows[0].ok === true);
await expectAnon("the same link can't be used twice", `select spark_link_submit('tok-good', '{"answers":[]}'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expectAnon("an expired link can't submit", `select spark_link_submit('tok-old', '{"answers":[]}'::jsonb) as ok`, true, r => r.rows[0].ok === false);
await expect("family sparks arrive attributed to the sender", "adm", `select created_by, source from student_sparks where source = 'family_link'`, true, r => r.rows.length === 1 && r.rows[0].created_by === ids.teach);
await expect("the submission is logged", "admin", `select count(*)::int n from access_log where action = 'spark_link_submit'`, true, r => r.rows[0].n === 1);
await expect("a staff member with sparks on file can't be deleted (deactivate instead)", "admin", `delete from staff where user_id = '${ids.teach}'`, false);
await expect("no app role can truncate the access log", "admin", `truncate access_log`, false);
await expect("admin revokes student_voice again", "admin", `update consents set revoked_at = now() where scope = 'student_voice' and revoked_at is null returning *`, true, r => r.rows.length === 1);
await expect("no new link without student_voice consent", "teach", link("teach", "tok-new"), false);
await expect("withdraw (delete) cascades, log survives", "admin", `delete from people where id='11111111-1111-1111-1111-111111111111' returning id`, true, r => r.rows.length === 1);
const left = await db.query("select (select count(*) from enrollments)::int e, (select count(*) from observations)::int o, (select count(*) from access_log)::int l");
const ok = left.rows[0].e === 0 && left.rows[0].o === 0 && left.rows[0].l >= 1; /* log entries outlive the person */ if (ok) pass++; else fail++;
console.log(`${ok ? "PASS" : "FAIL"}  cascade removed data, access log kept`, left.rows[0]);
await expect("admissions cannot add people", "adm", `insert into people (first_name,last_name,stage,is_sample) values ('A','B','applicant',true)`, false);
await expect("admin can still update staff", "admin", `update staff set display_name='Adm2' where user_id='${ids.adm}' returning *`, true, r => r.rows.length === 1);
await expect("teacher cannot update staff", "teach", `update staff set role='admin' where user_id='${ids.teach}' returning *`, true, r => r.rows.length === 0);
await expect("trigger functions not callable by users", "teach", `select private.enforce_consent()`, false);
// Staff self-provisioning (first confirmed sign-in from a school address).
const u = { p1: "00000000-0000-0000-0000-0000000000e1", p2: "00000000-0000-0000-0000-0000000000e2", sub: "00000000-0000-0000-0000-0000000000e3", gm: "00000000-0000-0000-0000-0000000000e4", un: "00000000-0000-0000-0000-0000000000e5" };
Object.assign(ids, { pending: u.p1 });
await db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('${u.p1}','New.Teacher@pacificachristian.org', now(), '{"full_name":"New Teacher"}'),
  ('${u.sub}','kid@students.pacificachristian.org', now(), '{}'),
  ('${u.gm}','someone@gmail.com', now(), '{}');
  insert into auth.users (id, email) values ('${u.un}','unconfirmed@pacificachristian.org');`);
const prov = await db.query(`select user_id, email, display_name, role, active from staff where user_id in ('${u.p1}','${u.sub}','${u.gm}','${u.un}')`);
const provOk = prov.rows.length === 1 && prov.rows[0].user_id === u.p1 && prov.rows[0].active === false && prov.rows[0].role === "staff" && prov.rows[0].display_name === "New Teacher" && prov.rows[0].email === "new.teacher@pacificachristian.org";
if (provOk) pass++; else fail++;
console.log(`${provOk ? "PASS" : "FAIL"}  confirmed school address → one PENDING staff row; subdomain, gmail, unconfirmed → none`, prov.rows);
await expect("pending staff sees no people", "pending", `select * from people`, true, r => r.rows.length === 0);
const samplePerson = (await db.query("select id from people limit 1")).rows[0].id;
await expect("pending staff cannot write an observation", "pending", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('${samplePerson}', '${u.p1}', 'N', 'x', 'x')`, false);
await expect("pending staff cannot approve themselves", "pending", `update staff set active = true where user_id = '${u.p1}' returning *`, true, r => r.rows.length === 0);
await expect("pending staff can read their own row", "pending", `select active from staff`, true, r => r.rows.length === 1 && r.rows[0].active === false);
await expect("teacher cannot turn on auto-approve", "teach", `update pilot_settings set auto_approve_staff = true returning *`, true, r => r.rows.length === 0);
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${u.un}'`);
const late = await db.query(`select active from staff where user_id = '${u.un}'`);
const lateOk = late.rows.length === 1 && late.rows[0].active === false; if (lateOk) pass++; else fail++;
console.log(`${lateOk ? "PASS" : "FAIL"}  unconfirmed user gets a pending row once they confirm`);
await expect("admin turns on auto-approve", "admin", `update pilot_settings set auto_approve_staff = true returning *`, true, r => r.rows.length === 1);
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${u.p2}','auto@pacificachristian.org', now())`);
const auto = await db.query(`select active from staff where user_id = '${u.p2}'`);
const autoOk = auto.rows.length === 1 && auto.rows[0].active === true; if (autoOk) pass++; else fail++;
console.log(`${autoOk ? "PASS" : "FAIL"}  with auto-approve on, a new school sign-in is active staff`);
// Student addresses (a number before the @) always wait, even with auto-approve on.
Object.assign(u, { stu: "00000000-0000-0000-0000-0000000000e6", stu2: "00000000-0000-0000-0000-0000000000e7" });
Object.assign(ids, { student: u.stu });
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${u.stu}','kid28@pacificachristian.org', now()), ('${u.stu2}','Sam.Ple2028@pacificachristian.org', now())`);
const stu = await db.query(`select active from staff where user_id in ('${u.stu}','${u.stu2}')`);
const stuOk = stu.rows.length === 2 && stu.rows.every(r => r.active === false); if (stuOk) pass++; else fail++;
console.log(`${stuOk ? "PASS" : "FAIL"}  with auto-approve on, a student address still waits for approval`, stu.rows);
await expect("a waiting student address sees no people", "student", `select * from people`, true, r => r.rows.length === 0);
await expect("a waiting student address cannot approve itself", "student", `update staff set active = true where user_id = '${u.stu}' returning *`, true, r => r.rows.length === 0);
await expect("a signed-in account cannot call the address check itself", "student", `select private.is_student_address('kid28@pacificachristian.org')`, false);
await expect("an admin can still approve a student contributor by hand", "admin", `update staff set active = true where user_id = '${u.stu}' returning *`, true, r => r.rows.length === 1);
const rule = await db.query(`select array_agg(private.is_student_address(e) order by o) as got from unnest(array['kid28@pacificachristian.org','ssample30@pacificachristian.org','Sam.Ple2028@pacificachristian.org','28sample@pacificachristian.org','ssample@pacificachristian.org','teacher@pacificachristian.org','you+wren@pacificachristian.org','teacher@school2.example','',null]) with ordinality as t(e, o)`);
const ruleOk = rule.rows[0].got.join() === "true,true,true,true,false,false,false,false,false,false"; if (ruleOk) pass++; else fail++;
console.log(`${ruleOk ? "PASS" : "FAIL"}  the address rule matches lib/sor/student-address.ts`, rule.rows[0].got);
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${ids.admin}'`);
const kept = await db.query(`select role from staff where user_id = '${ids.admin}'`);
const keptOk = kept.rows[0]?.role === "admin"; if (keptOk) pass++; else fail++;
console.log(`${keptOk ? "PASS" : "FAIL"}  re-confirming never overwrites an existing staff row`);
await expect("admin approves a pending teacher", "admin", `update staff set active = true, role = 'teacher' where user_id = '${u.p1}' returning *`, true, r => r.rows.length === 1);
await expect("...who can now see people", "pending", `select * from people`, true, r => r.rows.length >= 1);
// Admissions season counts: aggregates only, suppressed, live behind approval.
const fc = (count, sample = true, asOf = "2026-09-27") =>
  `insert into admissions_funnel_counts (entry_year, stage, as_of, count, is_sample) values (2027, 'inquiry', '${asOf}', ${count}, ${sample})`;
await expect("admin writes a sample season count", "admin", fc(120), true);
await expect("a count of 1–4 is refused (small-cell suppression)", "admin", fc(3, true, "2026-09-20"), false);
await expect("a suppressed (null) count is allowed", "admin", fc("null", true, "2026-09-13"), true);
await expect("live counts refused before funnel approval", "admin", fc(120, false), false);
await expect("funnel approval needs an approver", "admin", `update pilot_settings set funnel_live_enabled = true`, false);
await expect("admissions cannot approve live counts", "adm", `update pilot_settings set funnel_live_enabled = true, funnel_approved_by = 'x', funnel_approval_reference = 'y', funnel_approved_at = now() returning *`, true, r => r.rows.length === 0);
await expect("admin records funnel approval", "admin", `update pilot_settings set funnel_live_enabled = true, funnel_approved_by = 'Head of School', funnel_approval_reference = 'Email 2026-10-02', funnel_approved_at = now() returning *`, true, r => r.rows.length === 1);
await expect("live counts accepted after approval", "admin", fc(120, false), true);
await expect("admissions reads season counts", "adm", `select * from admissions_funnel_counts`, true, r => r.rows.length === 3);
await expect("teacher cannot read season counts", "teach", `select * from admissions_funnel_counts`, true, r => r.rows.length === 0);
await expect("admissions cannot write season counts", "adm", fc(200, true, "2026-09-06"), false);
const cols = await db.query(`select column_name from information_schema.columns where table_name = 'admissions_funnel_counts' order by 1`);
const colsOk = cols.rows.map(r => r.column_name).join() === "as_of,cohort,count,entry_year,imported_at,is_sample,stage"; if (colsOk) pass++; else fail++;
console.log(`${colsOk ? "PASS" : "FAIL"}  season counts table has no person, name or free-text column`, cols.rows.map(r => r.column_name));
// Fictional demo snapshot: admin and admissions only, as themselves, no deletes.
const snap = (who, v = 1) => `insert into demo_snapshots (version, db, updated_by) values (${v}, 'AAAA', '${ids[who]}') on conflict (id) do update set version = excluded.version, db = excluded.db, updated_by = excluded.updated_by, updated_at = now() returning version`;
await expect("non-staff cannot write the demo snapshot", "stranger", snap("stranger"), false);
await expect("a teacher cannot replace the demo snapshot", "teach", snap("teach"), false);
await expect("admin writes the demo snapshot", "admin", snap("admin"), true, r => r.rows.length === 1);
await expect("admissions cannot write it as someone else", "adm", `update demo_snapshots set version = 9, updated_by = '${ids.admin}' returning *`, false);
await expect("another staff member updates it", "adm", snap("adm", 2), true, r => r.rows[0]?.version === "2" || r.rows[0]?.version === 2n || r.rows[0]?.version === 2);
await expect("non-staff cannot read the demo snapshot", "stranger", `select * from demo_snapshots`, true, r => r.rows.length === 0);
await expect("staff reads the demo snapshot", "teach", `select version from demo_snapshots`, true, r => r.rows.length === 1);
await expect("nobody deletes the demo snapshot through the API", "admin", `delete from demo_snapshots returning *`, true, r => r.rows.length === 0);
await expect("only one snapshot row can exist", "admin", `insert into demo_snapshots (id, version, db, updated_by) values (2, 1, 'x', '${ids.admin}')`, false);

// Inquiries (/discover): closed until approval is recorded; the public only
// gets submit_inquiry(); only admin and admissions read them.
const inq = (extra = {}) => JSON.stringify({
  parent_first_name: "Pat", parent_last_name: "Rivera", parent_relationship: "Mother", parent_email: "pat@example.com",
  address_1: "1 Ocean Ave", city: "Newport Beach", state: "CA", zip: "92660", country: "United States",
  child_first_name: "Sam", child_last_name: "Rivera", child_grade: 9, entry_year: 2027, current_school: "Harbor View Middle School",
  one_thing: "Fixes every bike on our street.", interests: ["STEM", "Surf"], consent_contact: true, consent_pathway: true,
  consent_version: "2026-10-v1", source: "website", ...extra }).replace(/'/g, "''");
const submit = (extra) => `select submit_inquiry('${inq(extra)}'::jsonb) as code`;
await expectAnon("the public sees the form is closed", `select inquiries_open() as open`, true, r => r.rows[0].open === false);
await expectAnon("inquiries are refused until approval is recorded", submit(), false);
await expect("inquiries can't open without an approver", "admin", `update pilot_settings set inquiries_open = true`, false);
await expect("a teacher can't open inquiries", "teach", `update pilot_settings set inquiries_open = true, inquiries_approved_by = 'x', inquiries_approval_reference = 'y', inquiries_approved_at = now() returning *`, true, r => r.rows.length === 0);
await expect("admin opens inquiries with the approval recorded", "admin", `update pilot_settings set inquiries_open = true, inquiries_approved_by = 'Head of School', inquiries_approval_reference = 'Leadership mtg 2026-10-14', inquiries_approved_at = now() returning *`, true, r => r.rows.length === 1);
await expectAnon("...and now open", `select inquiries_open() as open`, true, r => r.rows[0].open === true);
let firstCode = null;
await expectAnon("a family inquires and gets their own share code", submit(), true, r => { firstCode = r.rows[0]?.code; return /^[A-Z0-9]{8}$/.test(firstCode ?? ""); });
await expectAnon("an inquiry through a family's link is credited to them", submit({ ref: firstCode?.toLowerCase(), parent_email: "lee@example.com", child_first_name: "Lee", address_1: "9 Bay St" }), true, r => /^[A-Z0-9]{8}$/.test(r.rows[0]?.code ?? ""));
await expect("...recorded as a share, by that code", "adm", `select source, referred_by_code from inquiries where child_first_name = 'Lee'`, true, r => r.rows[0]?.source === "share" && r.rows[0]?.referred_by_code === firstCode);
await expectAnon("an unknown referral code is ignored, not trusted", submit({ ref: "ZZZZZZZZ", parent_email: "kai@example.com", child_first_name: "Kai" }), true);
await expect("...and that inquiry isn't credited to anyone", "adm", `select source, referred_by_code from inquiries where child_first_name = 'Kai'`, true, r => r.rows[0]?.source === "website" && r.rows[0]?.referred_by_code === null);
await expectAnon("no inquiry without consent to be contacted", submit({ consent_contact: false }), false);
await expectAnon("a malformed email is refused", submit({ parent_email: "not-an-email" }), false);
await expectAnon("a missing address is refused (Finalsite needs it)", submit({ address_1: "" }), false);
await expectAnon("unexpected fields are refused", submit({ is_sample: true }), false);
await expectAnon("anon can't read inquiries", `select * from inquiries`, false, r => r.rows.length === 0);
await expectAnon("anon can't insert an inquiry directly", `insert into inquiries (share_code, parent_first_name) values ('AAAAAAAA','x')`, false);
await expect("a teacher can't read inquiries", "teach", `select * from inquiries`, true, r => r.rows.length === 0);
await expect("admissions reads inquiries", "adm", `select finalsite_external_id from inquiries`, true, r => r.rows.length === 3 && r.rows.every(x => /^FP-[0-9A-F]{12}$/.test(x.finalsite_external_id)));
await expect("admissions updates follow-up fields", "adm", `update inquiries set status = 'contacted', finalsite_exported_at = now() where child_first_name = 'Sam' returning id`, true, r => r.rows.length === 1);
await expect("what a family sent can't be edited", "adm", `update inquiries set parent_email = 'other@example.com' where child_first_name = 'Sam'`, false);
await expect("a teacher can't update inquiries", "teach", `update inquiries set status = 'closed' returning id`, true, r => r.rows.length === 0);
await expect("admin can add a fictional sample by hand", "admin", `insert into inquiries (share_code, parent_first_name, parent_last_name, parent_relationship, parent_email, address_1, city, state, zip, child_first_name, child_last_name, child_grade, entry_year, consent_contact, consent_version, is_sample) values ('SAMPLE01','A','B','Mother','a@example.com','1 St','City','CA','90000','C','D',9,2027,true,'v1',true)`, true);
await expect("...but not a real one", "admin", `insert into inquiries (share_code, parent_first_name, parent_last_name, parent_relationship, parent_email, address_1, city, state, zip, child_first_name, child_last_name, child_grade, entry_year, consent_contact, consent_version) values ('REAL0001','A','B','Mother','a@example.com','1 St','City','CA','90000','C','D',9,2027,true,'v1')`, false);
await expect("admissions can't delete inquiries", "adm", `delete from inquiries returning id`, true, r => r.rows.length === 0);
await expect("closing inquiries again", "admin", `update pilot_settings set inquiries_open = false returning *`, true, r => r.rows.length === 1);
await expectAnon("...shuts the form", submit({ parent_email: "late@example.com" }), false);


// Inquiry pathways: admissions drafts and signs; only for families who asked.
await expect("admissions adds a fictional sample (test mode)", "adm", `insert into inquiries (share_code, parent_first_name, parent_last_name, parent_relationship, parent_email, address_1, city, state, zip, child_first_name, child_last_name, child_grade, entry_year, consent_contact, consent_pathway, consent_version, is_sample) values ('TESTMODE','T','M','Father','t@example.com','1 St','City','CA','90000','Robin','M',9,2027,true,true,'v1',true) returning id`, true, r => r.rows.length === 1);
await expect("...but a teacher can't", "teach", `insert into inquiries (share_code, parent_first_name, parent_last_name, parent_relationship, parent_email, address_1, city, state, zip, child_first_name, child_last_name, child_grade, entry_year, consent_contact, consent_version, is_sample) values ('TEACHER1','T','M','Father','t@example.com','1 St','City','CA','90000','R','M',9,2027,true,'v1',true)`, false);
const robin = `(select id from inquiries where share_code = 'TESTMODE')`;
const noPathway = `(select id from inquiries where share_code = 'SAMPLE01')`; // added earlier without pathway consent
await expect("admissions drafts a pathway for a family who asked", "adm", `insert into inquiry_pathways (inquiry_id, pathways, generated_by) values (${robin}, '[{"name":"x"}]', '${ids.adm}') returning id`, true, r => r.rows.length === 1);
await expect("no pathway for a family who didn't ask", "adm", `insert into inquiry_pathways (inquiry_id, pathways, generated_by) values (${noPathway}, '[]', '${ids.adm}')`, false);
await expect("nobody drafts as someone else", "adm", `insert into inquiry_pathways (inquiry_id, pathways, generated_by) values (${robin}, '[]', '${ids.admin}')`, false);
await expect("a teacher can't draft or read inquiry pathways", "teach", `select * from inquiry_pathways`, true, r => r.rows.length === 0);
await expect("a draft can't move to another family", "adm", `update inquiry_pathways set inquiry_id = ${noPathway}`, false);
await expect("signing an inquiry pathway records the signer's own name", "adm", `update inquiry_pathways set status = 'approved', approved_by = 'Someone else' returning approved_by = (select display_name from staff where user_id = auth.uid()) as own`, true, r => r.rows[0]?.own === true);
await expect("a signed pathway is read-only", "admin", `update inquiry_pathways set pathways = '[]'`, false);
await expectAnon("anon can't read inquiry pathways", `select * from inquiry_pathways`, false, r => r.rows.length === 0);

// The family's own link and their shares (docs/family-sharing.md).
const flink = (who, t, inq = robin) => `insert into inquiry_family_links (inquiry_id, token_hash, created_by) values (${inq}, ${hash(t)}, '${ids[who]}') returning id`;
await expect("a teacher can't make a family link", "teach", flink("teach", "fam-teach"), false);
await expect("no link for a family without a signed pathway", "adm", flink("adm", "fam-none", noPathway), false);
await expect("admissions makes the family's link", "adm", flink("adm", "fam-good"), true, r => r.rows.length === 1);
await expect("a link can't be made to last a year", "adm", `insert into inquiry_family_links (inquiry_id, token_hash, created_by, expires_at) values (${robin}, ${hash("fam-long")}, '${ids.adm}', now() + interval '1 year')`, false);
await expect("an expired link (made by the database clock)", "admin", `insert into inquiry_family_links (inquiry_id, token_hash, created_by, expires_at) values (${robin}, ${hash("fam-old")}, '${ids.admin}', now() - interval '1 day') returning id`, true, r => r.rows.length === 1);
await expectAnon("anon can't read family links", `select * from inquiry_family_links`, false, r => r.rows.length === 0);
await expectAnon("the family's page: their own words and signed pathway, no contact details", `select family_page('fam-good') as p`, true, (r) => {
  const p = r.rows[0].p;
  return p && p.child_first_name === "Robin" && Array.isArray(p.pathways) && p.share_code === "TESTMODE"
    && !("parent_email" in p) && !("address_1" in p) && !("parent_phone" in p) && !("child_last_name" in p);
});
await expectAnon("a wrong token gets nothing", `select family_page('fam-guess') as p`, true, r => r.rows[0].p === null);
await expectAnon("an expired token gets nothing", `select family_page('fam-old') as p`, true, r => r.rows[0].p === null);
await expectAnon("a share needs a real card look", `select family_share('fam-good', 0, 'neon', true) as c`, true, r => r.rows[0].c === null);
await expectAnon("...and a pathway that exists", `select family_share('fam-good', 3, 'tide', true) as c`, true, r => r.rows[0].c === null);
await expectAnon("a wrong token can't share", `select family_share('fam-guess', 0, 'tide', true) as c`, true, r => r.rows[0].c === null);
await expectAnon("no share until a parent or guardian confirms", `select family_share('fam-good', 0, 'tide', false) as c`, true, r => r.rows[0].c === null);
await expectAnon("the family shares a pathway", `select family_share('fam-good', 0, 'tide', true) as c`, true, r => /^[0-9a-f]{12}$/.test(r.rows[0].c));
const code = (await db.query(`select code from inquiry_shares where style = 'tide' and stopped_at is null`)).rows[0]?.code ?? "none";
await expectAnon("the same choice gives the same code", `select family_share('fam-good', 0, 'tide', true) as c`, true, r => r.rows[0].c === code);
await expectAnon("anon can't read or write shares directly", `insert into inquiry_shares (inquiry_id, inquiry_pathway_id, pathway_index, style, code) select inquiry_id, id, 0, 'sky', 'aaaaaaaaaaaa' from inquiry_pathways`, false);
await expectAnon("the public share: first name and the pathway only", `select public_share('${code}') as s`, true, (r) => {
  const s = r.rows[0].s;
  return s && s.first_name === "Robin" && s.pathway.name === "x" && s.ref === "TESTMODE" && Object.keys(s).sort().join() === "first_name,pathway,ref,style,thanks" && s.thanks === true;
});
await expect("admissions sees the family's shares", "adm", `select * from inquiry_shares`, true, r => r.rows.length === 1);
await expect("a teacher doesn't", "teach", `select * from inquiry_shares`, true, r => r.rows.length === 0);
await expect("sharing is logged", "admin", `select count(*)::int n from access_log where action = 'inquiry_family_share'`, true, r => r.rows[0].n === 1);
await expectAnon("the family stops sharing", `select family_stop_sharing('fam-good') as n`, true, r => r.rows[0].n === 1);
await expectAnon("...and the public share is gone", `select public_share('${code}') as s`, true, r => r.rows[0].s === null);
await expect("admissions closes the inquiry", "adm", `update inquiries set status = 'closed' where share_code = 'TESTMODE' returning id`, true, r => r.rows.length === 1);
await expectAnon("...so the family link stops", `select family_page('fam-good') as p`, true, r => r.rows[0].p === null);
await expect("admissions reopens it", "adm", `update inquiries set status = 'contacted' where share_code = 'TESTMODE' returning id`, true, r => r.rows.length === 1);
await expect("deactivating the staff member who made the link", "admin", `update staff set active = false where user_id = '${ids.adm}' returning user_id`, true, r => r.rows.length === 1);
await expectAnon("...stops the link", `select family_page('fam-good') as p`, true, r => r.rows[0].p === null);
await expect("reactivating them", "admin", `update staff set active = true where user_id = '${ids.adm}' returning user_id`, true, r => r.rows.length === 1);
await expect("admissions can end a family's link", "adm", `delete from inquiry_family_links where token_hash = ${hash("fam-good")} returning id`, true, r => r.rows.length === 1);
await expectAnon("...and it's gone", `select family_page('fam-good') as p`, true, r => r.rows[0].p === null);

// Referrals and thank-yous (docs/referrals.md): confirmed only for the family
// whose link brought them, never self-referral, nothing approved for a real
// family until leadership's decision is recorded, a cap, no cash.
const admName = (await db.query(`select display_name from staff where user_id = '${ids.adm}'`)).rows[0].display_name;
const inqId = (where) => `(select id from inquiries where ${where})`;
const refer = (referred, referrer) => `insert into referral_thanks (referred_inquiry_id, referrer_inquiry_id) values (${inqId(referred)}, ${inqId(referrer)}) returning confirmed_by`;
const sampleInq = (code, email, ref, status = "new") => `insert into inquiries (share_code, parent_first_name, parent_last_name, parent_relationship, parent_email, address_1, city, state, zip, child_first_name, child_last_name, child_grade, entry_year, consent_contact, consent_version, is_sample, referred_by_code, source, status) values ('${code}','F','R','Mother','${email}','${code} Lane','City','CA','90001','Kid','R',9,2027,true,'v1',true,'${ref}','share','${status}')`;
await expect("a teacher can't confirm a referral", "teach", refer("child_first_name = 'Lee'", "child_first_name = 'Sam' and referred_by_code is null"), false);
await expect("admissions confirms a real referral, as themselves", "adm", refer("child_first_name = 'Lee'", "child_first_name = 'Sam' and referred_by_code is null"), true, r => r.rows[0]?.confirmed_by === admName);
await expect("a family that didn't come through the link can't be credited", "adm", refer("child_first_name = 'Kai'", "child_first_name = 'Sam' and referred_by_code is null"), false);
for (const [c, e, st] of [["SELFREF1", "t@example.com"], ["FRIEND01", "friend1@example.com"], ["FRIEND02", "friend2@example.com", "applied"]]) {
  await expect(`a sample family for trying it (${c})`, "admin", sampleInq(c, e, "TESTMODE", st), true);
}
await expect("a family can't refer itself", "adm", refer("share_code = 'SELFREF1'", "share_code = 'TESTMODE'"), false);
await expect("admissions confirms a sample referral", "adm", refer("share_code = 'FRIEND01'", "share_code = 'TESTMODE'"), true);
const thanks = (code) => `(select id from referral_thanks where referred_inquiry_id = ${inqId(`share_code = '${code}'`)})`;
await expect("no thank-you before the family they brought applies", "adm", `update referral_thanks set status = 'approved' where id = ${thanks("FRIEND01")}`, false);
await expect("the referred family applies", "adm", `update inquiries set status = 'applied' where share_code = 'FRIEND01' returning id`, true, r => r.rows.length === 1);
await expect("then the thank-you is approved, by the signed-in staff member", "adm", `update referral_thanks set status = 'approved', approved_by = 'Head of School' where id = ${thanks("FRIEND01")} returning approved_by, what`, true, r => r.rows[0]?.approved_by === admName && /note/.test(r.rows[0]?.what ?? ""));
await expect("and recorded as sent by whoever sent it", "admin", `update referral_thanks set status = 'sent' where id = ${thanks("FRIEND01")} returning sent_by`, true, r => r.rows[0]?.sent_by === "Admin");
await expect("a sent thank-you is settled", "adm", `update referral_thanks set note = 'changed' where id = ${thanks("FRIEND01")}`, false);
await expect("a referral can't be moved to another family", "adm", `update referral_thanks set referrer_inquiry_id = ${inqId("share_code = 'SAMPLE01'")} where id = ${thanks("FRIEND01")}`, false);
await expect("the referred real family applies", "adm", `update inquiries set status = 'applied' where child_first_name = 'Lee' returning id`, true, r => r.rows.length === 1);
await expect("no thank-you for a real family until leadership decides", "adm", `update referral_thanks set status = 'approved' where referred_inquiry_id = ${inqId("child_first_name = 'Lee'")}`, false);
await expect("thank-yous can't open without the decision recorded", "admin", `update pilot_settings set referral_thanks_open = true`, false);
await expect("a thank-you can't be cash", "admin", `update pilot_settings set referral_thanks_open = true, referral_thanks_what = 'A $50 gift card', referral_thanks_approved_by = 'Head', referral_thanks_approval_reference = 'mtg', referral_thanks_approved_at = now()`, false);
await expect("a teacher can't record the decision", "teach", `update pilot_settings set referral_thanks_open = true, referral_thanks_what = 'A note', referral_thanks_approved_by = 'Head', referral_thanks_approval_reference = 'mtg', referral_thanks_approved_at = now() returning *`, true, r => r.rows.length === 0);
await expect("admin records leadership's decision", "admin", `update pilot_settings set referral_thanks_open = true, referral_thanks_what = 'A handwritten note and a Pacifica sweatshirt', referral_thanks_approved_by = 'Head of School', referral_thanks_approval_reference = 'Leadership mtg 2026-10-21', referral_thanks_approved_at = now(), referral_thanks_cap = 1 returning *`, true, r => r.rows.length === 1);
await expect("then a real thank-you is approved with what leadership chose", "adm", `update referral_thanks set status = 'approved' where referred_inquiry_id = ${inqId("child_first_name = 'Lee'")} returning what`, true, r => /sweatshirt/.test(r.rows[0]?.what ?? ""));
await expect("admissions confirms a second sample referral", "adm", refer("share_code = 'FRIEND02'", "share_code = 'TESTMODE'"), true);
await expect("no more thank-yous than the cap", "adm", `update referral_thanks set status = 'approved' where id = ${thanks("FRIEND02")}`, false);
await expect("declining needs a note", "adm", `update referral_thanks set status = 'declined' where id = ${thanks("FRIEND02")}`, false);
await expect("declined with a note", "adm", `update referral_thanks set status = 'declined', note = 'Already thanked this year' where id = ${thanks("FRIEND02")} returning id`, true, r => r.rows.length === 1);
await expect("nobody deletes a thank-you record", "admin", `delete from referral_thanks returning id`, true, r => r.rows.length === 0);
await expect("a teacher can't read referrals", "teach", `select * from referral_thanks`, true, r => r.rows.length === 0);
await expectAnon("anon can't read referrals", `select * from referral_thanks`, false, r => r.rows.length === 0);

await expectAnon("the public can ask whether thank-yous are on (and only that)", `select referral_thanks_open() as on`, true, r => r.rows[0].on === true);
await expectAnon("but still can't read the decision", `select referral_thanks_what from pilot_settings`, false, r => r.rows.length === 0);
// The public form's backstop throttle.
await expect("inquiries open again", "admin", `update pilot_settings set inquiries_open = true, inquiries_approved_by = 'Head of School', inquiries_approval_reference = 'mtg', inquiries_approved_at = now() returning *`, true, r => r.rows.length === 1);
await expectAnon("a second child from the same family", submit({ child_first_name: "Sib" }), true);
await expectAnon("a third", submit({ child_first_name: "Sib2" }), true);
await expectAnon("but not a fourth in a day", submit({ child_first_name: "Sib3" }), false);

// View-only accounts (role `viewer`): fictional samples only, and no writes.
const v = { viewer: "00000000-0000-0000-0000-00000000a11e", real: "99999999-9999-9999-9999-999999999999" };
Object.assign(ids, { viewer: v.viewer });
const vSample = (await db.query("select id from people where is_sample limit 1")).rows[0].id;
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${v.viewer}','helper30@pacificachristian.org', now())`);
// The account starts as a teacher and makes rows of its own, so the checks
// below also cover "you may change what you made yourself" rules.
await as("admin", `update staff set role = 'teacher', active = true where user_id = '${v.viewer}'`);
await as("viewer", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('${vSample}', '${v.viewer}', 'V', 'mine', 'mine')`);
await as("viewer", `insert into student_sparks (person_id, sparks, created_by) values ('${vSample}', '{"answers":[]}', '${v.viewer}')`);
await as("viewer", `insert into class_reflections (person_id, reflections, created_by) values ('${vSample}', '{"classes":[]}', '${v.viewer}')`);
await as("viewer", `insert into class_resources (person_id, class_title, title, url, kind, created_by) values ('${vSample}', 'Chemistry', 'Mine', 'https://example.org/mine', 'Practice', '${v.viewer}')`);
await as("viewer", `insert into spark_links (person_id, token_hash, first_name, created_by) values ('${vSample}', ${hash("tok-viewer-own")}, 'Sam', '${v.viewer}')`);
await expect("an admin gives a student contributor the view-only role", "admin", `update staff set role = 'viewer', active = true where user_id = '${v.viewer}' returning role`, true, r => r.rows[0]?.role === "viewer");
// One real student and one sample, each with a row in every table a viewer may read.
await as("admin", `insert into people (id, first_name, last_name, stage) values ('${v.real}','Real','Two','enrolled')`);
await as("admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) select '${v.real}', s, 'Parent Two', '2026-09-30', 'Signed form', '${ids.admin}' from unnest(enum_range(null::consent_scope)) s`);
await as("admin", `insert into consents (person_id, scope, granted_by, granted_on, evidence, recorded_by) values ('${vSample}', 'student_voice', 'Sample Parent', '2026-09-30', 'Fictional', '${ids.admin}')`);
for (const p of [v.real, vSample]) {
  await as("admin", `insert into enrollments (person_id, grade) values ('${p}', 10) on conflict (person_id) do nothing`);
  await as("admin", `insert into course_history (person_id, section_id, school_year, course_title) values ('${p}', 'v1', '2026-2027', 'Chemistry')`);
  await as("teach", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('${p}', '${ids.teach}', 'T', 'x', 'x')`);
  await as("teach", `insert into student_sparks (person_id, sparks, created_by) values ('${p}', '{"answers":[]}', '${ids.teach}')`);
  await as("teach", `insert into class_reflections (person_id, reflections, created_by) values ('${p}', '{"classes":[]}', '${ids.teach}')`);
  await as("teach", `insert into class_resources (person_id, class_title, title, url, kind, created_by) values ('${p}', 'Chemistry', 'Moles', 'https://example.org/moles', 'Practice', '${ids.teach}')`);
}
await expect("a viewer sees fictional sample people only", "viewer", `select is_sample from people`, true, r => r.rows.length >= 1 && r.rows.every(x => x.is_sample));
await expect("...while a teacher still sees everyone", "teach", `select count(*) filter (where not is_sample)::int as n from people`, true, r => r.rows[0].n >= 1);
for (const t of ["consents", "enrollments", "course_history", "observations", "student_sparks", "class_reflections", "class_resources"]) {
  const there = (await db.query(`select count(*)::int as n from ${t} where person_id = '${v.real}'`)).rows[0].n;
  await expect(`a viewer reads ${t} for samples, never a real student's (${there} there)`, "viewer", `select count(*)::int as n, count(*) filter (where person_id = '${v.real}')::int as real_n from ${t}`, true, r => there >= 1 && r.rows[0].n >= 1 && r.rows[0].real_n === 0);
}
for (const t of ["pathway_drafts", "admissions_records", "external_ids", "spark_links", "pilot_settings", "demo_snapshots", "access_log", "inquiries", "import_runs", "admissions_funnel_counts", "referral_thanks"])
  await expect(`a viewer reads nothing from ${t}`, "viewer", `select * from ${t}`, true, r => r.rows.length === 0);
await expect("a viewer sees only their own staff row", "viewer", `select user_id from staff`, true, r => r.rows.length === 1 && r.rows[0].user_id === v.viewer);
await expect("a viewer cannot write an observation, even about a sample", "viewer", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('${vSample}', '${v.viewer}', 'V', 'x', 'x')`, false);
await expect("a viewer cannot save sparks", "viewer", `insert into student_sparks (person_id, sparks, created_by) values ('${vSample}', '{"answers":[]}', '${v.viewer}')`, false);
await expect("a viewer cannot save class reflections", "viewer", `insert into class_reflections (person_id, reflections, created_by) values ('${vSample}', '{"classes":[]}', '${v.viewer}')`, false);
await expect("a viewer cannot suggest a resource", "viewer", `insert into class_resources (person_id, class_title, title, url, kind, created_by) values ('${vSample}', 'Chemistry', 'x', 'https://example.org/', 'Practice', '${v.viewer}')`, false);
await expect("a viewer cannot make an at-home link", "viewer", `insert into spark_links (person_id, token_hash, first_name, created_by) values ('${vSample}', ${hash("tok-viewer-new")}, 'Sam', '${v.viewer}')`, false);
await expect("a viewer cannot add a person", "viewer", `insert into people (first_name, last_name, stage, is_sample) values ('New', 'Sample', 'applicant', true)`, false);
for (const t of ["people", "observations", "class_resources", "consents", "student_sparks"]) {
  await expect(`a viewer cannot change ${t}`, "viewer", `update ${t} set created_at = now() returning *`, true, r => r.rows.length === 0);
  await expect(`a viewer cannot delete from ${t}`, "viewer", `delete from ${t} returning *`, true, r => r.rows.length === 0);
}
await expect("a viewer cannot change their own role", "viewer", `update staff set role = 'admin' where user_id = '${v.viewer}' returning *`, true, r => r.rows.length === 0);
await expect("a viewer's views are logged as themselves", "viewer", `insert into access_log (staff_id, action, person_id) values ('${v.viewer}', 'view_person', '${vSample}')`, true);
await expect("a viewer cannot log as someone else", "viewer", `insert into access_log (staff_id, action) values ('${ids.admin}', 'view_person')`, false);
await expect("an admin sees the viewer's log entry", "admin", `select * from access_log where staff_id = '${v.viewer}'`, true, r => r.rows.length === 1);
// Try to change and delete everything, in every table, with no WHERE (so a
// read rule can't hide a loose write rule). Nothing may change.
const vTables = (await db.query(`select c.relname as t, (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum limit 1) as col from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
const vCount = async () => Object.fromEntries(await Promise.all(vTables.map(async ({ t }) => [t, (await db.query(`select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from ${t} x`)).rows[0]])));
const vBefore = await vCount();
for (const { t, col } of vTables) {
  for (const sql of [`update ${t} set ${col} = ${col}`, `delete from ${t}`]) { try { await as("viewer", sql); } catch { /* refused outright is fine */ } }
}
const vAfter = await vCount();
const vChanged = vTables.map(({ t }) => t).filter((t) => vBefore[t].n !== vAfter[t].n || vBefore[t].h !== vAfter[t].h);
const vNothing = vChanged.length === 0 && vTables.length >= 20; if (vNothing) pass++; else fail++;
console.log(`${vNothing ? "PASS" : "FAIL"}  a viewer changing and deleting everything in all ${vTables.length} tables changes nothing, even rows they made as a teacher`, vChanged);
const vMine = (await db.query(`select (select count(*) from observations where author_id = '${v.viewer}')::int as obs, (select count(*) from spark_links where created_by = '${v.viewer}')::int as links`)).rows[0];
const vKept = vMine.obs === 1 && vMine.links === 1; if (vKept) pass++; else fail++;
console.log(`${vKept ? "PASS" : "FAIL"}  ...including their own earlier note and at-home link`, vMine);
await db.exec(`update staff set active = false where user_id = '${ids.leaver}'`);
await as("teach", `insert into observations (person_id, author_id, author_name, raw_text, body) values ('${vSample}', '${ids.teach}', 'T', 'kept', 'kept')`);
await db.exec(`update observations set author_id = '${ids.leaver}' where raw_text = 'kept'`);
try { await as("leaver", `delete from observations`); } catch { /* refused outright is fine */ }
const vLeaver = (await db.query(`select count(*)::int as n from observations where raw_text = 'kept'`)).rows[0].n === 1; if (vLeaver) pass++; else fail++;
console.log(`${vLeaver ? "PASS" : "FAIL"}  an account with access removed can't delete the notes it wrote`);
// Default deny holds only while every policy names a role check: is_staff()
// and has_role() leave viewers out, so a policy without one would let them in.
// The Mastery Hub's helpers count too: teaches_course() / teaches_person() are
// built on has_role('admin') and is_staff(), and current_student() matches only
// a registered student sign-in, which an active staff address can't have
// (cases under "Mastery Hub" below check a viewer gets nothing).
// Only policies a signed-in account can reach count (mastery_importer's are
// for that database role alone; cases under "automatic imports" cover them).
const open = await db.query(`select tablename || '.' || policyname as p from pg_policies where schemaname = 'public' and (roles && array['authenticated', 'public']::name[]) and policyname <> 'staff_read' and coalesce(qual, '') || ' ' || coalesce(with_check, '') !~ (case when policyname like '%_viewer_%' then '(is_viewer|viewer_sees)\\(' else '(is_staff|has_role|teaches_course|teaches_person|current_student)\\(' end)`);
const noneOpen = open.rows.length === 0; if (noneOpen) pass++; else fail++;
console.log(`${noneOpen ? "PASS" : "FAIL"}  every policy names a role check, so a view-only account gets nothing by accident`, open.rows.map(r => r.p));
const viewerWrites = await db.query(`select tablename || '.' || policyname as p from pg_policies where schemaname = 'public' and policyname like '%_viewer_%' and cmd <> 'SELECT' and policyname <> 'access_log_viewer_insert'`);
const noViewerWrites = viewerWrites.rows.length === 0; if (noViewerWrites) pass++; else fail++;
console.log(`${noViewerWrites ? "PASS" : "FAIL"}  the only thing a viewer can write is their own access-log entry`, viewerWrites.rows.map(r => r.p));
// Mastery Hub (Fizzy #37): one teacher's course, scores allowed here only,
// students sign in and see only their own.
Object.assign(ids, { teach2: "00000000-0000-0000-0000-0000000000f2", kid: "00000000-0000-0000-0000-0000000000f3", kidUnconfirmed: "00000000-0000-0000-0000-0000000000f4" });
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ids.teach2}','other.teacher@pacificachristian.org', now());
update staff set active = true, role = 'teacher' where user_id = '${ids.teach2}';`);
const real = "'22222222-2222-2222-2222-222222222222'";
await db.exec(`update pilot_settings set real_data_enabled = true, approved_by = coalesce(approved_by, 'Head of School'), approval_reference = coalesce(approval_reference, 'mtg'), approved_at = coalesce(approved_at, now());
insert into people (id, first_name, last_name, stage) values (${real}, 'Mastery', 'Kid', 'enrolled');
insert into consents (person_id, scope, granted_by, granted_on, evidence) values (${real}, 'mastery_records', 'Parent Kid', '2026-10-12', 'Signed form');`);
const sampleOne = "(select id from people where is_sample limit 1)";
const course = "(select id from mastery_courses where title = 'AP Physics 1')";
const sampleCourse = "(select id from mastery_courses where title = 'AP Physics 1 (sample)')";
const ev = (who, extra = "") => `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score${extra ? ", level" : ""}) values (${course}, ${real}, '2.5', 'canvas', 'Unit 2 quiz', 8, 10${extra ? `, '${extra}'` : ""}) returning recorded_by`;
await expect("a teacher creates their own mastery course", "teach", `insert into mastery_courses (title, slug, config_key) values ('AP Physics 1', 'APPhysics1', 'ap-physics-1') returning teacher_id`, true, r => r.rows[0]?.teacher_id === ids.teach);
await expect("but not one in someone else's name", "teach", `insert into mastery_courses (title, slug, config_key, teacher_id) values ('Theirs', 'Theirs', 'ap-physics-1', '${ids.admin}')`, false);
await expect("admissions can't create a mastery course", "adm", `insert into mastery_courses (title, slug, config_key) values ('X', 'Xcourse', 'ap-physics-1')`, false);
await expect("the teacher puts a consented student on the roster", "teach", `insert into mastery_roster (course_id, person_id) values (${course}, ${real}) returning person_id`, true, r => r.rows.length === 1);
await expect("another teacher can't add to that roster", "teach2", `insert into mastery_roster (course_id, person_id) values (${course}, ${sampleOne})`, false);
await expect("another teacher can't see the course", "teach2", `select * from mastery_courses`, true, r => r.rows.length === 0);
await expect("a sample course", "teach", `insert into mastery_courses (title, slug, config_key, is_sample) values ('AP Physics 1 (sample)', 'APPhysics1-Sample', 'ap-physics-1', true) returning id`, true, r => r.rows.length === 1);
await expect("two courses can't share an address, in any capitalization", "admin", `insert into mastery_courses (title, slug, config_key) values ('Again', 'apphysics1', 'ap-physics-1')`, false);
await expect("an address is letters, numbers and dashes", "teach", `insert into mastery_courses (title, slug, config_key) values ('Bad', 'AP Physics/1', 'ap-physics-1')`, false);
await expect("the teacher marks the class finished through Unit 2", "teach", `update mastery_courses set finished_through = 2 where slug = 'APPhysics1' returning finished_through`, true, r => r.rows[0]?.finished_through === 2);
await expect("a sample course holds no real student", "teach", `insert into mastery_roster (course_id, person_id) values (${sampleCourse}, ${real})`, false);
await expect("a course can't turn from sample to real", "teach", `update mastery_courses set is_sample = false where title = 'AP Physics 1 (sample)'`, false);
await expect("no evidence for a student who isn't on the roster", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level) values (${course}, ${sampleOne}, '1.1', 'oral', 'Oral exam', 'proficient')`, false);
await expect("the teacher records a score, as themselves", "teach", ev("teach"), true, r => r.rows[0]?.recorded_by === ids.teach);
await expect("evidence needs a level or a full score", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score) values (${course}, ${real}, '2.5', 'canvas', 'Half', 3)`, false);
await expect("an unknown level is refused", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level) values (${course}, ${real}, '2.5', 'oral', 'Oral', 'A+')`, false);
await expect("a link must be https", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level, link) values (${course}, ${real}, '2.5', 'oral', 'Oral', 'developing', 'javascript:alert(1)')`, false);
await expect("the same import row twice adds nothing", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score, external_key) values (${course}, ${real}, '2.5', 'canvas', 'Quiz', 1, 2, 'canvas:1'), (${course}, ${real}, '2.5', 'canvas', 'Quiz', 1, 2, 'canvas:1')`, false);
await expect("evidence is never edited", "teach", `update mastery_evidence set score = 10 returning id`, true, r => r.rows.length === 0);
await expect("admissions can't read a teacher's grades", "adm", `select * from mastery_evidence`, true, r => r.rows.length === 0);
await expect("another teacher can't read them", "teach2", `select * from mastery_evidence`, true, r => r.rows.length === 0);
await expect("an admin can", "admin", `select * from mastery_evidence`, true, r => r.rows.length === 1);
await expect("a staff address can't be a student sign-in", "teach", `insert into student_accounts (person_id, email) values (${real}, 'c@pacificachristian.org')`, false);
await expect("a non-school address can't be a student sign-in", "teach", `insert into student_accounts (person_id, email) values (${real}, 'kid@gmail.com')`, false);
await expect("another teacher can't give this student a sign-in", "teach2", `insert into student_accounts (person_id, email) values (${real}, 'mkid30@pacificachristian.org')`, false);
await expect("the course's teacher gives the student a sign-in", "teach", `insert into student_accounts (person_id, email) values (${real}, 'mkid30@pacificachristian.org') returning created_by`, true, r => r.rows[0]?.created_by === ids.teach);
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ids.kid}','MKid30@pacificachristian.org', now()), ('${ids.kidUnconfirmed}','mkid30@pacificachristian.org', null) on conflict do nothing;`).catch(async () => {
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ids.kid}','MKid30@pacificachristian.org', now())`);
});
await expect("a registered student's sign-in makes no staff row", "admin", `select * from staff where lower(email) = 'mkid30@pacificachristian.org'`, true, r => r.rows.length === 0);
await expect("the student sees their own course", "kid", `select title from mastery_courses`, true, r => r.rows.length === 1 && r.rows[0].title === "AP Physics 1");
await expect("the student sees their own evidence, scores included", "kid", `select score from mastery_evidence`, true, r => r.rows.length === 1 && Number(r.rows[0].score) === 8);
await expect("the student sees only their own name in people", "kid", `select id from people`, true, r => r.rows.length === 1);
await expect("the student sees no observations", "kid", `select * from observations`, true, r => r.rows.length === 0);
await expect("the student sees no sparks or drafts", "kid", `select (select count(*) from student_sparks) + (select count(*) from pathway_drafts) as n`, true, r => Number(r.rows[0].n) === 0);
await expect("the student can't read the log", "kid", `select * from mastery_log`, true, r => r.rows.length === 0);
await expect("the student can't add evidence", "kid", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level) values (${course}, ${real}, '2.5', 'student', 'Me', 'extending')`, false);
await expect("the student can't add themselves to a course", "kid", `insert into mastery_roster (course_id, person_id) values (${sampleCourse}, ${real})`, false);
await expect("the student asks for an oral exam", "kid", `insert into mastery_requests (course_id, person_id, standard_code, kind, message, status) values (${course}, ${real}, '2.5', 'oral_exam', 'Ready for 2.5', 'done') returning status, created_by`, true, r => r.rows[0]?.status === "open" && r.rows[0]?.created_by === ids.kid);
await expect("the student sends evidence with a link", "kid", `insert into mastery_requests (course_id, person_id, standard_code, kind, message, link) values (${course}, ${real}, '3.4', 'evidence', 'PhET energy lab', 'https://phet.colorado.edu/en/simulations/energy-skate-park') returning id`, true, r => r.rows.length === 1);
await expect("...but not for another student", "kid", `insert into mastery_requests (course_id, person_id, standard_code, kind) values (${course}, ${sampleOne}, '2.5', 'oral_exam')`, false);
await expect("the student can't answer their own request", "kid", `update mastery_requests set status = 'accepted' returning id`, true, r => r.rows.length === 0);
await expect("the teacher schedules it, stamped as them", "teach", `update mastery_requests set status = 'scheduled', response = 'Thursday at lunch' where kind = 'oral_exam' returning resolved_by`, true, r => r.rows[0]?.resolved_by === ids.teach);
await expect("the teacher can't rewrite what the student asked", "teach", `update mastery_requests set message = 'changed'`, false);
await expect("a student account with an unconfirmed address sees nothing", "kidUnconfirmed", `select * from mastery_evidence`, true, r => r.rows.length === 0);
await expect("the teacher pauses the Canvas import", "teach", `insert into mastery_sources (course_id, source, paused) values (${course}, 'canvas', true) returning paused`, true, r => r.rows[0]?.paused === true);
await expect("another teacher can't flip it", "teach2", `update mastery_sources set paused = false returning *`, true, r => r.rows.length === 0);
await expect("the teacher deletes a wrong piece of evidence", "teach", `delete from mastery_evidence where title = 'Unit 2 quiz' returning id`, true, r => r.rows.length === 1);
await expect("every change is in the log", "teach", `select action from mastery_log order by id`, true, r => ["mastery_roster_insert", "mastery_evidence_insert", "student_accounts_insert", "mastery_requests_insert", "mastery_requests_update", "mastery_sources_insert", "mastery_evidence_delete"].every(a => r.rows.some(x => x.action === a)));
await expect("nobody edits the log", "admin", `update mastery_log set action = 'x' returning id`, true, r => r.rows.length === 0);
await expect("nobody deletes the log", "admin", `delete from mastery_log returning id`, true, r => r.rows.length === 0);
await expect("the teacher can't log as someone else", "teach", `insert into mastery_log (course_id, actor, action) values (${course}, '${ids.admin}', 'import')`, false);
await expect("the teacher reads their roster's Canvas ids", "teach", `select * from external_ids where system = 'canvas'`, true);
await expect("a view-only account sees no mastery course", "viewer", `select * from mastery_courses`, true, r => r.rows.length === 0);
await expect("...or evidence", "viewer", `select * from mastery_evidence`, true, r => r.rows.length === 0);
await expect("...and can't start a course", "viewer", `insert into mastery_courses (title, slug, config_key) values ('X', 'Xcourse', 'ap-physics-1')`, false);
await expect("admin turns the student sign-in off", "admin", `update student_accounts set active = false returning person_id`, true, r => r.rows.length === 1);
await expect("then the student sees nothing", "kid", `select * from mastery_courses`, true, r => r.rows.length === 0);
await expect("revoking mastery_records consent", "admin", `update consents set revoked_at = now() where scope = 'mastery_records' and revoked_at is null and person_id = ${real} returning id`, true, r => r.rows.length === 1);
await expect("...stops new evidence", "teach", ev("teach", "proficient"), false);

// Mastery Hub automatic imports: the mastery_importer database role.
async function asImporter(sql) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role mastery_importer;");
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
async function expectImporter(name, sql, ok, check) {
  let r, err;
  try { r = await asImporter(sql); } catch (e) { err = e; }
  const good = ok ? !err && (!check || check(r)) : !!err || (check && check(r));
  if (good) pass++; else fail++;
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${err ? "  (" + err.message.slice(0, 90) + ")" : ""}`);
}
const kidReal = "'22222222-2222-2222-2222-222222222222'";
await db.exec(`update consents set revoked_at = null where person_id = ${kidReal} and scope = 'mastery_records';
update mastery_courses set canvas_course_id = '555' where slug = 'APPhysics1';
insert into external_ids (person_id, system, external_id) values (${kidReal}, 'canvas', '9001') on conflict do nothing;`);
const imp = (extra = "") => `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score, external_key) values ((select id from mastery_courses where canvas_course_id = '555'), ${kidReal}, '2.5', 'canvas', 'Unit 2 quiz [2.5]', 9, 10, 'canvas:assignment:1:9'${extra})`;
await expectImporter("the importer sees only real courses connected to Canvas", `select id from mastery_courses`, true, r => r.rows.length === 1);
await expectImporter("...their Canvas ids", `select external_id from external_ids`, true, r => r.rows.length === 1 && r.rows[0].external_id === '9001');
await expectImporter("...but no names", `select first_name from people`, false);
await expectImporter("...no observations or drafts", `select * from observations`, false);
await expectImporter("...and no scores", `select score from mastery_evidence`, false);
await expectImporter("it adds a Canvas grade, recorded as automatic", imp(), true);
await expectImporter("the same grade twice adds nothing", imp(), false);
await expectImporter("it can't add an oral exam", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score) values ((select id from mastery_courses where canvas_course_id = '555'), ${kidReal}, '2.5', 'oral', 'Oral', 9, 10)`, false);
await expectImporter("it can't set a level", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level) values ((select id from mastery_courses where canvas_course_id = '555'), ${kidReal}, '2.5', 'khan', 'x', 'extending')`, false);
await expectImporter("it can't touch a sample course", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, score, max_score) values ((select id from mastery_courses where slug = 'APPhysics1-Sample' limit 1), (select id from people where is_sample limit 1), '2.5', 'canvas', 'x', 1, 2)`, false);
await expectImporter("it can't delete evidence", `delete from mastery_evidence returning id`, false);
await expectImporter("it records its run", `insert into mastery_sources (course_id, source, last_run_at, last_summary) values ((select id from mastery_courses where canvas_course_id = '555'), 'canvas', now(), '1 new') on conflict (course_id, source) do update set last_run_at = excluded.last_run_at, last_summary = excluded.last_summary`, true);
await expectImporter("it can't switch a source back on", `update mastery_sources set paused = false`, false);
await expectImporter("it logs as the system", `insert into mastery_log (course_id, actor, action, detail) values ((select id from mastery_courses where canvas_course_id = '555'), null, 'import_canvas_scheduled', '{}')`, true);
await expectImporter("...and as nobody else", `insert into mastery_log (course_id, actor, action) values ((select id from mastery_courses where canvas_course_id = '555'), '${ids.teach}', 'import_canvas_scheduled')`, false);
await expect("the teacher sees the automatic grade, with no person recorded", "teach", `select recorded_by from mastery_evidence where external_key = 'canvas:assignment:1:9'`, true, r => r.rows.length === 1 && r.rows[0].recorded_by === null);
await expect("a teacher can't add evidence without being recorded", "teach", `insert into mastery_evidence (course_id, person_id, standard_code, source, title, level) values ((select id from mastery_courses where slug = 'APPhysics1'), ${kidReal}, '2.5', 'oral', 'Oral', 'proficient') returning recorded_by`, true, r => r.rows[0]?.recorded_by === ids.teach);

// Mastery Hub: standard sets edited in the hub, and next steps shared by the teacher.
const set = (key) => `insert into mastery_standard_sets (key, config) values ('${key}', '{"key":"${key}"}') returning created_by`;
await expect("a teacher saves a standard set, as its owner", "teach", set("chem-honors"), true, r => r.rows[0]?.created_by === ids.teach);
await expect("another teacher can't change it", "teach2", `update mastery_standard_sets set config = '{}' where key = 'chem-honors' returning key`, true, r => r.rows.length === 0);
await expect("admissions can't create one", "adm", set("x-adm"), false);
await expect("its owner edits it, and the key stays", "teach", `update mastery_standard_sets set config = '{"key":"chem-honors","v":2}' where key = 'chem-honors' returning updated_by`, true, r => r.rows[0]?.updated_by === ids.teach);
await expect("the key can't change", "teach", `update mastery_standard_sets set key = 'chem' where key = 'chem-honors'`, false);
await expect("every save is kept", "teach", `select count(*)::int as n from mastery_standard_set_versions where key = 'chem-honors'`, true, r => r.rows[0].n === 2);
await expect("nobody edits the history", "admin", `update mastery_standard_set_versions set config = '{}' returning id`, true, r => r.rows.length === 0);
await expect("a stranger can't read standard sets", "stranger", `select * from mastery_standard_sets`, true, r => r.rows.length === 0);
await expect("the importer reads standard sets", "admin", `select 1`, true);
await expectImporter("...as the importer", `select key from mastery_standard_sets`, true, r => r.rows.length >= 1);
const ns = (aiUsed) => `insert into mastery_next_steps (course_id, person_id, steps, used_ai, status) values ((select id from mastery_courses where slug = 'APPhysics1'), ${kidReal}, '[{"standard":"2.5","text":"Try the PhET lab"}]', ${aiUsed}, 'shared') returning status, drafted_by`;
await expect("the teacher saves rule-based next steps, always as a draft", "teach", ns(false), true, r => r.rows[0]?.status === "draft" && r.rows[0]?.drafted_by === ids.teach);
await db.exec(`update consents set revoked_at = now() where person_id = ${kidReal} and scope = 'ai_drafting' and revoked_at is null`);
await expect("an AI draft needs ai_drafting consent", "teach", ns(true), false);
await db.exec(`insert into consents (person_id, scope, granted_by, granted_on, evidence) values (${kidReal}, 'ai_drafting', 'Parent Kid', '2026-10-12', 'Signed form')`);
await expect("...and with it, works", "teach", ns(true), true);
await db.exec(`update student_accounts set active = true where person_id = ${kidReal}`);
await expect("the student sees no draft", "kid", `select * from mastery_next_steps`, true, r => r.rows.length === 0);
await expect("another teacher can't share it", "teach2", `update mastery_next_steps set status = 'shared' returning id`, true, r => r.rows.length === 0);
await expect("the teacher shares one, signed with their own name", "teach", `update mastery_next_steps set status = 'shared', shared_by_name = 'Head of School' where id = (select id from mastery_next_steps where used_ai limit 1) returning shared_by_name`, true, r => r.rows[0]?.shared_by_name === "Teach");
await expect("now the student sees it", "kid", `select steps from mastery_next_steps`, true, r => r.rows.length === 1);
await expect("shared next steps are read-only", "teach", `update mastery_next_steps set steps = '[]' where status = 'shared'`, false);
await expect("a shared one can't be deleted", "teach", `delete from mastery_next_steps where status = 'shared' returning id`, true, r => r.rows.length === 0);
await expect("a draft can be", "teach", `delete from mastery_next_steps where status = 'draft' returning id`, true, r => r.rows.length === 1);

// Mastery Hub browser extension: token-only access, Khan key skills, tagged resources.
const physicsId = (await db.query("select id from mastery_courses where slug = 'APPhysics1'")).rows[0].id;
const theirsId = (await db.query(`insert into mastery_courses (title, slug, config_key, teacher_id) values ('Admin physics', 'AdminPhysics', 'ap-physics-1', '${ids.admin}') returning id`)).rows[0].id;
const physics = `'${physicsId}'`;
const sqlJson = (o) => JSON.stringify(o).replace(/'/g, "''");
await expect("a teacher connects the extension", "teach", `insert into mastery_extension_tokens (token_hash, label) values (${hash("ext-good")}, 'My Chrome') returning staff_id`, true, r => r.rows[0]?.staff_id === ids.teach);
await expect("a connection is always the maker's own", "teach", `insert into mastery_extension_tokens (token_hash, staff_id) values (${hash("ext-x")}, '${ids.admin}') returning staff_id`, true, r => r.rows[0]?.staff_id === ids.teach);
await expect("admissions can't connect one", "adm", `insert into mastery_extension_tokens (token_hash) values (${hash("ext-adm")})`, false);
await expect("another teacher can't see the connection", "teach2", `select * from mastery_extension_tokens`, true, r => r.rows.length === 0);
await expectAnon("a wrong token gets nothing", `select mastery_ext_context('nope') as c`, true, r => r.rows[0].c === null);
await expectAnon("the token gets the teacher's own courses and roster", `select mastery_ext_context('ext-good') as c`, true, (r) => {
  const c = r.rows[0].c; const phys = c?.courses?.find((x) => x.slug === "APPhysics1");
  return c && phys && phys.roster.length === 1 && c.courses.every((x) => x.slug !== "Theirs");
});
const sync = (payload) => `select mastery_ext_khan_sync('ext-good', ${physics}, '${sqlJson(payload)}'::jsonb) as r`;
const skills = [
  { id: "x1", title: "Newton's second law", unit: "Force and translational dynamics" },
  { id: "x2", title: "Free body diagrams", unit: "Force and translational dynamics" },
  { id: "x3", title: "Friction", unit: "Force and translational dynamics" },
  { id: "x4", title: "Springs", unit: "Force and translational dynamics" },
];
await expectAnon("the first sync keeps the skill catalog, adds no evidence yet", sync({ skills, links: [{ kaid: "kaid_kid1", person: "22222222-2222-2222-2222-222222222222" }, { kaid: "kaid_other", person: "11111111-1111-1111-1111-111111111111" }], levels: [] }), true, r => r.rows[0].r.skills === 4 && r.rows[0].r.links === 1 && r.rows[0].r.added === 0);
await expect("the teacher picks key skills and maps them", "teach", `update mastery_khan_skills set chosen = true, standard_code = case skill_id when 'x1' then '2.5' when 'x2' then '2.2' else '2.7' end where skill_id in ('x1','x2','x3') returning skill_id`, true, r => r.rows.length === 3);
await expect("a fourth key skill in the same unit is refused", "teach", `update mastery_khan_skills set chosen = true, standard_code = '2.8' where skill_id = 'x4'`, false);
await expect("a key skill needs a standard", "teach", `update mastery_khan_skills set chosen = true, standard_code = null where skill_id = 'x1'`, false);
const levels = [
  { person: "22222222-2222-2222-2222-222222222222", skill: "x1", level: "mastered" },
  { person: "22222222-2222-2222-2222-222222222222", skill: "x2", level: "proficient" },
  { person: "22222222-2222-2222-2222-222222222222", skill: "x3", level: "familiar" },
  { person: "22222222-2222-2222-2222-222222222222", skill: "x4", level: "mastered" },
  { person: "11111111-1111-1111-1111-111111111111", skill: "x1", level: "mastered" },
];
await expectAnon("only key skills at proficient or mastered become evidence", sync({ skills: [], links: [], levels }), true, r => r.rows[0].r.added === 2);
await expect("mastered counts as Extending, proficient as Proficient", "teach", `select standard_code, level, recorded_by from mastery_evidence where source = 'khan' and external_key like 'khan:%' order by standard_code`, true, r => r.rows.length === 2 && r.rows[0].standard_code === "2.2" && r.rows[0].level === "proficient" && r.rows[1].level === "extending" && r.rows[1].recorded_by === null);
await expectAnon("the same sync again adds nothing", sync({ skills: [], links: [], levels }), true, r => r.rows[0].r.added === 0);
await expectAnon("not another teacher's course", `select mastery_ext_khan_sync('ext-good', '${theirsId}', '{"skills":[],"links":[],"levels":[]}'::jsonb)`, false);
await expect("the teacher pauses Khan", "teach", `insert into mastery_sources (course_id, source, paused) values (${physics}, 'khan', true) on conflict (course_id, source) do update set paused = true returning paused`, true, r => r.rows[0]?.paused === true);
await expectAnon("a paused source refuses the sync", sync({ skills: [], links: [], levels }), false);
await expect("...and turns it back on", "teach", `update mastery_sources set paused = false where source = 'khan' returning id`, false);
await db.exec(`update mastery_sources set paused = false where source = 'khan'`);
const tag = (extra) => `select mastery_ext_tag('ext-good', ${physics}, '${sqlJson({ kind: "other", title: "Great friction demo", url: "https://example.org/friction", standard: "2.7", ...extra })}'::jsonb) as id`;
await expectAnon("the teacher tags a page for a standard", tag({}), true, r => !!r.rows[0].id);
await expectAnon("a YouTube video needs its id", tag({ kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), false);
await expectAnon("...and with it, is saved", tag({ kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", video_id: "dQw4w9WgXcQ", channel: "Someone" }), true);
await expectAnon("only https pages", tag({ url: "javascript:alert(1)" }), false);
await expect("the student sees the tagged resources", "kid", `select title from mastery_course_resources`, true, r => r.rows.length === 2);
await expect("...but never Khan links, key skills or connections", "kid", `select (select count(*) from mastery_khan_links) + (select count(*) from mastery_khan_skills) + (select count(*) from mastery_extension_tokens) as n`, true, r => Number(r.rows[0].n) === 0);
await expect("the teacher revokes the connection", "teach", `update mastery_extension_tokens set revoked_at = now() where label = 'My Chrome' returning token_hash`, true, r => r.rows.length === 1);
await expect("a revoked connection can't come back", "teach", `update mastery_extension_tokens set revoked_at = null where label = 'My Chrome'`, false);
await expectAnon("a revoked token gets nothing", `select mastery_ext_context('ext-good') as c`, true, r => r.rows[0].c === null);
await expectAnon("...and can't sync", sync({ skills: [], links: [], levels }), false);

const exposed = await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef");
const noneExposed = exposed.rows.length === 0; if (noneExposed) pass++; else fail++;
console.log(`${noneExposed ? "PASS" : "FAIL"}  no SECURITY DEFINER function in the API-exposed public schema`, exposed.rows.map(r => r.proname));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
