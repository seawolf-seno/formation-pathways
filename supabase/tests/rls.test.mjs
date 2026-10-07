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
const exposed = await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef");
const noneExposed = exposed.rows.length === 0; if (noneExposed) pass++; else fail++;
console.log(`${noneExposed ? "PASS" : "FAIL"}  no SECURITY DEFINER function in the API-exposed public schema`, exposed.rows.map(r => r.proname));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
