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
await expectAnon("an inquiry through a family's link is credited to them", submit({ ref: firstCode?.toLowerCase(), parent_email: "lee@example.com", child_first_name: "Lee" }), true, r => /^[A-Z0-9]{8}$/.test(r.rows[0]?.code ?? ""));
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
await expectAnon("a share needs a real card look", `select family_share('fam-good', 0, 'neon') as c`, true, r => r.rows[0].c === null);
await expectAnon("...and a pathway that exists", `select family_share('fam-good', 3, 'tide') as c`, true, r => r.rows[0].c === null);
await expectAnon("a wrong token can't share", `select family_share('fam-guess', 0, 'tide') as c`, true, r => r.rows[0].c === null);
await expectAnon("the family shares a pathway", `select family_share('fam-good', 0, 'tide') as c`, true, r => /^[0-9a-f]{12}$/.test(r.rows[0].c));
const code = (await db.query(`select code from inquiry_shares where style = 'tide' and stopped_at is null`)).rows[0]?.code ?? "none";
await expectAnon("the same choice gives the same code", `select family_share('fam-good', 0, 'tide') as c`, true, r => r.rows[0].c === code);
await expectAnon("anon can't read or write shares directly", `insert into inquiry_shares (inquiry_id, inquiry_pathway_id, pathway_index, style, code) select inquiry_id, id, 0, 'sky', 'aaaaaaaaaaaa' from inquiry_pathways`, false);
await expectAnon("the public share: first name and the pathway only", `select public_share('${code}') as s`, true, (r) => {
  const s = r.rows[0].s;
  return s && s.first_name === "Robin" && s.pathway.name === "x" && s.ref === "TESTMODE" && Object.keys(s).sort().join() === "first_name,pathway,ref,style";
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

// STEM Scholars: use fictional people only; execute the actual migration.
const stemPerson = "44444444-4444-4444-4444-444444444441";
const stemOther = "44444444-4444-4444-4444-444444444442";
await expect("STEM sample students can be added", "admin", `insert into people(id,first_name,last_name,stage,is_sample) values ('${stemPerson}','Casey','Sample','enrolled',true),('${stemOther}','Avery','Sample','enrolled',true)`, true);
await expect("STEM stranger cannot enroll a student", "stranger", `insert into stem_memberships(person_id,created_by) values ('${stemPerson}','${ids.stranger}')`, false);
await expect("STEM cannot enroll as someone else", "teach", `insert into stem_memberships(person_id,created_by) values ('${stemPerson}','${ids.admin}')`, false);
await expect("STEM teacher starts own student's application", "teach", `insert into stem_memberships(person_id,created_by) values ('${stemPerson}','${ids.teach}'),('${stemOther}','${ids.teach}')`, true);
await expect("STEM one application per student", "admin", `insert into stem_memberships(person_id,created_by) values ('${stemPerson}','${ids.admin}')`, false);
await expect("STEM distinction cannot be forged on insert", "admin", `insert into stem_memberships(person_id,created_by,status) select id,'${ids.admin}','distinction' from people where id not in ('${stemPerson}','${stemOther}') limit 1`, false);
await expect("STEM empty application cannot submit", "teach", `update stem_memberships set status='submitted' where person_id='${stemPerson}'`, false);
await expect("STEM unsubmitted application cannot be accepted", "teach", `update stem_memberships set status='active' where person_id='${stemPerson}'`, false);
await expect("STEM teacher cannot change program requirements", "teach", `update stem_program set requirements=array['Invent a rule'] returning id`, true, r => r.rows.length === 0);
await expect("STEM admin configures draft requirements", "admin", `update stem_program set requirements=array['Document a project','Meet and reflect'] returning approved_at`, true, r => r.rows[0].approved_at === null);
await expect("STEM teacher cannot add directory contacts", "teach", `insert into stem_mentors(name,kind,expertise) values ('Fictional Guide','mentor','Engineering')`, false);
await expect("STEM admin adds mentor", "admin", `insert into stem_mentors(id,name,kind,expertise,contact) values ('55555555-5555-5555-5555-555555555551','Fictional Guide','alumni','Engineering','private@example.test')`, true);
await expect("STEM admin publishes an opportunity", "admin", `insert into stem_opportunities(title,kind,organization,description,url,published) values ('Sample internship','internship','Fictional lab','Explore a question','https://example.test/internship',true),('Unpublished','research','Fictional lab','Hidden','https://example.test/private',false)`, true);
await expect("STEM dangerous opportunity URLs refused", "admin", `insert into stem_opportunities(title,kind,organization,description,url) values ('X','event','X','X','javascript:alert(1)')`, false);
const stemHash = "tok-stem";
await expect("STEM teacher makes private student link", "teach", `insert into stem_links(person_id,token_hash,created_by) values ('${stemPerson}',${hash(stemHash)},'${ids.teach}')`, true);
await expect("STEM links cannot last beyond 30 days", "teach", `insert into stem_links(person_id,token_hash,created_by,expires_at) values ('${stemPerson}',${hash("tok-stem-long")},'${ids.teach}',now()+interval '31 days')`, false);
await expectAnon("STEM anon cannot read memberships directly", `select * from stem_memberships`, false);
await expectAnon("STEM anon cannot read work directly", `select * from stem_work`, false);
await expectAnon("STEM wrong token reveals nothing", `select stem_student_view('guess') v`, true, r => r.rows[0].v === null);
await expectAnon("STEM student sees no staff contact or IDs", `select stem_student_view('${stemHash}') v`, true, r => { const v = r.rows[0].v; return v.first_name === 'Casey' && !JSON.stringify(v).includes('private@example.test') && !JSON.stringify(v).includes(stemPerson) && v.opportunities.length === 1; });
await expectAnon("STEM extra application fields refused", `select stem_student_submit('${stemHash}','application','{"interest":"x","goal":"y","availability":"z","status":"distinction"}') ok`, true, r => r.rows[0].ok === false);
await expectAnon("STEM incomplete application refused", `select stem_student_submit('${stemHash}','application','{"interest":"x","goal":"","availability":"z"}') ok`, true, r => r.rows[0].ok === false);
await expectAnon("STEM student submits application", `select stem_student_submit('${stemHash}','application','{"interest":"Water science","goal":"Build a filter","availability":"Tuesday"}') ok`, true, r => r.rows[0].ok === true);
await expectAnon("STEM student cannot overwrite submitted application", `select stem_student_submit('${stemHash}','application','{"interest":"changed","goal":"y","availability":"z"}') ok`, true, r => r.rows[0].ok === false);
await expect("STEM application review attributes the actual coordinator", "teach", `update stem_memberships set status='active',reviewed_by='Forged name' where person_id='${stemPerson}' returning reviewed_by`, true, r => r.rows[0].reviewed_by === 'Teach');
await expectAnon("STEM student adds a project", `select stem_student_submit('${stemHash}','project','{"title":"Water filter","body":"Built a prototype","next_step":"Try another material"}') ok`, true, r => r.rows[0].ok === true);
await expect("STEM another student's project", "teach", `insert into stem_work(id,person_id,kind,title,created_by) values ('66666666-6666-6666-6666-666666666661','${stemOther}','project','Other student project','${ids.teach}')`, true);
await expectAnon("STEM token cannot edit another student's project", `select stem_student_submit('${stemHash}','project','{"id":"66666666-6666-6666-6666-666666666661","title":"Stolen project","body":"X"}') ok`, true, r => r.rows[0].ok === false);
const ownProject = (await db.query(`select id from stem_work where person_id='${stemPerson}' and kind='project'`)).rows[0].id;
await expectAnon("STEM student updates their own project", `select stem_student_submit('${stemHash}','project','{"id":"${ownProject}","title":"Water filter","body":"Second prototype","status":"active"}') ok`, true, r => r.rows[0].ok === true);
await expect("STEM staff note stays private", "teach", `insert into stem_work(person_id,kind,title,body,next_step,created_by) values ('${stemPerson}','meeting','Mentor meeting','Staff-only discussion','Bring the prototype','${ids.teach}')`, true);
await expectAnon("STEM student cannot submit meeting notes", `select stem_student_submit('${stemHash}','meeting','{"title":"X","body":"X"}') ok`, true, r => r.rows[0].ok === false);
await expectAnon("STEM student cannot approve their evidence", `select stem_student_submit('${stemHash}','evidence','{"title":"X","body":"X","requirement":"Document a project","approved_by":"Me"}') ok`, true, r => r.rows[0].ok === false);
await expectAnon("STEM student requests introduction", `select stem_student_submit('${stemHash}','mentor','{"mentor_id":"55555555-5555-5555-5555-555555555551"}') ok`, true, r => r.rows[0].ok === true);
await expect("STEM coordinator cannot transfer a project to another person", "teach", `update stem_work set person_id='${stemOther}' where kind='project' and person_id='${stemPerson}'`, false);
await expect("STEM project URL script refused", "teach", `update stem_work set url='javascript:alert(1)' where kind='project' and person_id='${stemPerson}'`, false);
await expect("STEM distinction blocked until requirements approved", "teach", `update stem_memberships set status='distinction' where person_id='${stemPerson}'`, false);
await expect("STEM admin approves rubric as themselves", "admin", `update stem_program set approved_at=now(),approved_by='Forged' returning approved_by`, true, r => r.rows[0].approved_by === 'Admin');
await expect("STEM distinction blocked without reviewed evidence", "teach", `update stem_memberships set status='distinction' where person_id='${stemPerson}'`, false);
await expectAnon("STEM student submits valid requirement evidence", `select stem_student_submit('${stemHash}','evidence','{"title":"Filter design","body":"A prototype and reflection","requirement":"Document a project"}') ok`, true, r => r.rows[0].ok === true);
await expect("STEM reviewer cannot invent signoff at insert", "teach", `insert into stem_work(person_id,kind,title,body,requirement,approved_by,approved_at,created_by) values ('${stemPerson}','evidence','Reflection','Meaningful reflection','Meet and reflect','Teach',now(),'${ids.teach}')`, false);
await expect("STEM add second piece of evidence", "teach", `insert into stem_work(person_id,kind,title,body,requirement,created_by) values ('${stemPerson}','evidence','Reflection','Meaningful reflection','Meet and reflect','${ids.teach}')`, true);
await expect("STEM evidence reviewer attribution is enforced", "teach", `update stem_work set approved_at=now(),approved_by='Forged' where person_id='${stemPerson}' and kind='evidence' returning approved_by`, true, r => r.rows.length === 2 && r.rows.every(w => w.approved_by === 'Teach'));
await expect("STEM signed evidence cannot be rewritten", "admin", `update stem_work set body='Changed' where person_id='${stemPerson}' and kind='evidence'`, false);
await expect("STEM coordinator awards distinction with rubric snapshot", "teach", `update stem_memberships set status='distinction',distinction_by='Forged' where person_id='${stemPerson}' returning distinction_by,distinction_requirements`, true, r => r.rows[0].distinction_by === 'Teach' && r.rows[0].distinction_requirements.length === 2);
await expect("STEM signed distinction cannot be edited", "admin", `update stem_memberships set status='active' where person_id='${stemPerson}'`, false);
await expectAnon("STEM distinguished student can't change evidence", `select stem_student_submit('${stemHash}','evidence','{"title":"X","body":"X","requirement":"Meet and reflect"}') ok`, true, r => r.rows[0].ok === false);
await expect("STEM editing requirements clears approval", "admin", `update stem_program set requirements=array['New requirement'] returning approved_at`, true, r => r.rows[0].approved_at === null);
await expect("STEM awards retain the reviewed rubric", "teach", `select distinction_requirements from stem_memberships where person_id='${stemPerson}'`, true, r => r.rows[0].distinction_requirements.includes('Document a project'));
await expect("STEM assistant saves biweekly draft", "teach", `insert into stem_work(person_id,kind,title,body,period_start,period_end,created_by) values ('${stemPerson}','summary','Update','A reviewed update',current_date-14,current_date,'${ids.teach}')`, true);
await expect("STEM one summary per period", "teach", `insert into stem_work(person_id,kind,title,body,period_start,period_end,created_by) values ('${stemPerson}','summary','Duplicate','X',current_date-14,current_date,'${ids.teach}')`, false);
await expect("STEM summary period must be two weeks", "teach", `insert into stem_work(person_id,kind,title,body,period_start,period_end,created_by) values ('${stemPerson}','summary','X','X',current_date-20,current_date-1,'${ids.teach}')`, false);
await expectAnon("STEM drafts and staff notes excluded from student page", `select stem_student_view('${stemHash}') v`, true, r => !JSON.stringify(r.rows[0].v).includes('Staff-only discussion') && !r.rows[0].v.work.some(w => w.kind === 'summary'));
await expect("STEM unsigned summary cannot be marked delivered", "teach", `update stem_work set delivered_at=now() where person_id='${stemPerson}' and kind='summary'`, false);
await expectAnon("STEM anonymous caller cannot trigger coordinator bot", `select stem_prepare_due_summaries()`, false);
await expect("STEM coordinator bot leaves periods not yet due alone", "teach", `select stem_prepare_due_summaries() n`, true, r => r.rows[0].n === 0);
await expect("STEM coordinator signs summary", "teach", `update stem_work set approved_at=now(),approved_by='Teach' where person_id='${stemPerson}' and kind='summary'`, true);
await expectAnon("STEM signed summary appears for student", `select stem_student_view('${stemHash}') v`, true, r => r.rows[0].v.work.some(w => w.kind === 'summary'));
await expect("STEM signed summary read-only", "teach", `update stem_work set body='Another update' where person_id='${stemPerson}' and kind='summary'`, false);
await expect("STEM coordinator confirms delivery", "teach", `update stem_work set delivered_at=now() where person_id='${stemPerson}' and kind='summary' returning delivered_at`, true, r => r.rows[0].delivered_at !== null);
await expect("STEM writes are audited", "admin", `select count(*)::int n from access_log where action like 'stem_%' and person_id='${stemPerson}'`, true, r => r.rows[0].n >= 10);
await expect("STEM deactivating link creator", "admin", `update staff set active=false where user_id='${ids.teach}'`, true);
await expectAnon("STEM inactive coordinator invalidates student link", `select stem_student_view('${stemHash}') v`, true, r => r.rows[0].v === null);
await expect("STEM reactivate coordinator", "admin", `update staff set active=true where user_id='${ids.teach}'`, true);
await expect("STEM teacher can revoke own link", "teach", `delete from stem_links where token_hash=${hash(stemHash)} returning id`, true, r => r.rows.length === 1);
await expectAnon("STEM revoked link no longer reads", `select stem_student_view('${stemHash}') v`, true, r => r.rows[0].v === null);
// A fresh real participant with no student_voice consent cannot enter the hub.
await expect("STEM no real-student application without consent", "admin", `insert into stem_memberships(person_id,created_by) values ('11111111-1111-1111-1111-111111111111','${ids.admin}')`, false);
await expect("STEM owner can add an already expired link", "teach", `insert into stem_links(person_id,token_hash,created_by,expires_at) values ('${stemOther}',${hash('stem-old')},'${ids.teach}',now()-interval '1 day')`, true);
await expectAnon("STEM expired token stops reads", `select stem_student_view('stem-old') v`, true, r => r.rows[0].v === null);
await expectAnon("STEM expired token stops writes", `select stem_student_submit('stem-old','project','{"title":"X"}') ok`, true, r => r.rows[0].ok === false);

const exposed = await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef");
const noneExposed = exposed.rows.length === 0; if (noneExposed) pass++; else fail++;
console.log(`${noneExposed ? "PASS" : "FAIL"}  no SECURITY DEFINER function in the API-exposed public schema`, exposed.rows.map(r => r.proname));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
