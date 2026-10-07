# Security review, 2026-10-07

Fizzy card #26. A review of the code, the database rules and the public pages of Formation Pathways, before the pilot widens. It covered:
- every Server Action and route,
- every row-level security policy, trigger and database function,
- the pages anyone can open without signing in,
- HTTP headers, dependencies, and the full git history for leaked secrets.

No live data was read and nothing in Vercel or Supabase was changed. Hosting is covered separately in `docs/hosting-move.md`.

**Headline:** nothing lets a stranger read student data. The real gaps were:
- a critical Next.js advisory on a public route,
- a sign-in redirect that could be bent to another site,
- a fictional demo that any school-domain account could drive (spending API budget),
- a few places where an admin or admissions account could do more than intended with drafts and the sample flag.

All of these are fixed below, the database ones once the migration is applied.

## Fixed in the code (PR for #26)

| | Severity | What it was | Fix |
|---|---|---|---|
| 1 | Critical | `next@16.3.5` is in the range of GHSA-vcvr-r3jv-pc5j (remote code execution in `next/og` image rendering), used by the public share-card route. | Next 16.3.8; `sharp` 0.35.5. `npm audit --omit=dev`: 0 vulnerabilities. |
| 2 | Medium | Open redirect after sign-in: `?next=/\evil.example` passed the check and sent a just-signed-in staff member to another site. | `lib/safe-next.ts` resolves `next` and keeps only same-site paths; used by the code, link and Google flows and `/auth/callback`. |
| 3 | Medium | The demo (`/apply`, `/applicant`, `(staff)` pages and all 26 demo actions) only required a school-domain account, which pending and deactivated accounts also have. Server Actions are public POST endpoints, so such an account could call the Claude-backed actions in a loop. | `lib/demo-access.ts`: active staff only in production, on every demo page and action (the token-scoped applicant Spark survey stays public). |
| 4 | Medium (dormant) | Setting `MOCK_INTEGRATIONS=false` in production would have pointed the demo's Canvas/Drive sync at the pilot's real Canvas credential, outside the pilot's allowlist and consent. | The demo never uses live Canvas or Drive in production. |
| 5 | Low-medium | Spark sessions were trusted on read. A family link can submit straight to the database, so a malformed session could break that student's page. | Every session is re-validated on read; invalid ones are skipped and logged. |
| 6 | Low | Signing a draft and revoking a consent weren't tied to the student named in the access log, and a signed draft could be re-signed. | Both now match the student and require an unsigned draft or an active consent. |
| 7 | Low | The Blackbaud token cookie survived sign-out. | Cleared on sign-out; always `Secure` in production. |
| 8 | Low | No security headers. | Frame denial, `nosniff`, referrer and permissions policies, HSTS, and a Content-Security-Policy in **report-only** mode (switch to enforcing after a week with no violations in the browser console). `X-Powered-By` removed. |
| 9 | Low | `.fizzy.yaml` (holds a token) was ignored only by one machine's global git config; CI's token had default permissions; `/login` could be indexed. | Repo `.gitignore`, `permissions: contents: read`, `noindex` on `/login`. |

## Fixed in the database: apply `20261008000000_security_hardening.sql`

Apply it in the Supabase SQL editor (or `supabase db push`). Then open `/pilot` as an admin; the drift check covers tables and columns, not these rules. It adds 20 guardrail tests to `npm run test:db` (122 pass). Run without the migration, those tests fail.

- **Drafts.**
  - Editing a draft re-checks AI-drafting consent; before, consent was checked on insert only.
  - A draft can't move to another student or change its author.
  - A signed draft is read-only.
  - The "signed by" name is always the signer's own staff name. Before, an admissions user could rewrite a signed draft or sign it as someone else.
- **The sample flag is fixed once a person exists.** A fictional sample counts as consented to everything and skips the real-student AI switch. Before, an admin could turn a real student into a "sample" and bypass every consent check.
- **Family links.**
  - The server sets `created_at`, so the 30-day cap can't be stretched.
  - A link stops working once the staff member who sent it is deactivated.
  - A direct submission must have the shape the app saves: known keys, lists only, the app's length limits.
- **Staff can't label a session they saved as "sent from home".**
- **Departing staff.** Deleting a staff record used to delete every Spark session and link they made, including families' answers. It is now refused. Deactivate staff instead.
- **Shared demo snapshot:** only admin and admissions may replace it. A teacher's demo edits now stay on that server instance.
- **No app role can TRUNCATE a table.** Row-level security doesn't cover it.

## Needs a decision

1. **What the plain `staff` role can read.** Any active staff account can read every student's observations (including the raw dictation and any discipline flag), consent records (parents' names and evidence) and enrollments. With auto-approve on, that is every holder of a school address. Suggested: observations readable by admin, admissions, teachers and their author only; consents by admin and admissions. Related: card #21.
2. **Staff who leave.** A staff member can change their sign-in email to a personal address and keep access after their school mailbox is closed, until an admin deactivates them. Turn on Supabase Auth's secure email change (or disable email changes), and make "deactivate in /pilot" part of offboarding.
3. **Preview deployments use the production database.** Code from any unmerged branch runs against real student data, behind Vercel sign-in. Give Preview its own Supabase project with fictional data only (see `docs/hosting-move.md`).
4. **Rate limits.** Nothing limits requests to `/login` (email codes), the family Spark link, or the share-card image. Add Vercel Firewall rate-limit rules, about 20 requests per minute per IP, and check Supabase Auth's own limits.
5. **Revoking consent stops new writes but keeps existing data visible.** That may be intended (withdrawal deletes the person). Decide and write it down.
6. **Supabase settings to confirm:**
   - the Auth redirect allow list has no wildcard such as `*.vercel.app`;
   - leaked-password protection is on, if password sign-in is ever enabled (the security advisor flags it).

## Lower priority, not changed

- **Proxy matcher.** Its exemptions are prefix matches, so a future route named like `/login-help` or `/iconography` would skip the proxy. Today every page and action checks access itself, so this is a trap for later rather than a hole. Anchor the patterns when adding a route.
- **Demo shortcuts.**
  - Demo signatures are free text.
  - Demo applicant tokens are 32 bits. Fine while those pages need sign-in; use 16+ bytes if they ever become public.
  - The demo snapshot is opened as a raw SQLite file. Load it defensively, or store rows as JSON, if writers ever widen again.
- **Fail-closed gates.** The real-data and funnel gates read `pilot_settings` without `coalesce(…, false)`. No app role can delete that row, but failing closed would be cheaper than relying on that.
- **Free-text attribution.**
  - An observation's `author_name` can be anything (only `author_id` is checked).
  - A consent's `recorded_by` is chosen by the admin who records it.
  - A new staff member's display name comes from their own sign-up details.

  Derive them from the session.

## Checked and fine

- Row-level security is on for every table, and no policy is `using (true)`.
- `anon` can call only the two family-link functions; it reads and writes nothing else.
- Every privileged database function has a fixed `search_path` and explicit grants, and none lives in the API-exposed `public` schema.
- Family links:
  - 256-bit random tokens, stored only as a SHA-256 hash;
  - single use, with a row lock;
  - expiry and consent are checked when a link is made and when it's used;
  - a visitor learns only a first name.
- Staff self-provisioning creates pending `staff` accounts only. Nobody can activate or promote themselves, and the email domain is enforced on every staff row.
- Every system-of-record action checks the signed-in staff member and role before touching data, with row-level security behind it.
- Blackbaud sign-in uses PKCE plus a checked `state`. The token lives only in an httpOnly cookie, readable only by admin actions.
- Public share pages serve only a whitelisted snapshot. They are GET-only, not cached and not indexed, and send no referrer.
- No secrets in the current tree or anywhere in git history (105 commits, scanned for Anthropic, Supabase, GitHub, Vercel, cloud and private-key patterns).
- No `dangerouslySetInnerHTML`; AI and user text render as text. No server secret reaches the browser.
