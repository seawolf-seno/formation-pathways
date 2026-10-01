# October 5 demo: setup, test checklist, run of show

Everything shown is fictional or sample data. The student pilot stays LOCKED.

## Where it runs

| | Local (`npm run dev`) | Vercel (production URL) |
|---|---|---|
| Sign-in | Only for `/season`, `/pilot`, `/capture` | **Every page** except `/share/*`, `/from/*`, `/spark/*` (school account) |
| `/season`, `/pilot`, `/capture` (Supabase) | Persists | Persists |
| Fictional demo (`/`, `/admissions`, `/applicant/*`, shares, inquiries) | Persists in `data/formation.db` | Persists for anyone **signed in**: every write saves a copy of the demo database to Supabase (`demo_snapshots`), and every instance loads the newest copy. A visitor who isn't signed in sees only that server's copy. Needs migration `20261001180000_demo_snapshots.sql` applied. |
| Phone capture | No (phone can't reach localhost; the mic needs HTTPS) | Yes |

On Vercel, what you create in the fictional demo (a share link, an approval, a
captured moment on `/`) now persists for any signed-in browser (see
`lib/demo-persist.ts`). Someone who isn't signed in, such as an audience member
on their own phone, can still hit a server that hasn't caught up and get a 404.
So keep presenting from your signed-in laptop or phone, and don't hand the
audience a share link. To reset the demo, delete the row in the Supabase SQL
editor (`delete from demo_snapshots;`), and the next visit re-seeds.

## A. Setup (the day before)

1. `git checkout main && git pull`
2. Local only: reset the demo data with `rm data/formation.db*`, then `npm run dev`.
3. **Sign in** (`/login`, school email, 6-digit code) the day before, on the laptop
   *and* the phone you'll use. Supabase's built-in email sends only a few messages
   an hour. If no code arrives, add `{{ .Token }}` to the *Magic Link* and
   *Confirm signup* templates (Supabase → Authentication → Emails).
4. `/season` → Data source → **Load sample figures**. The badge reads
   "Sample figures (fictional)".
5. `/pilot`: six sample students, gate **LOCKED**. Run the three sample imports once
   if the import log is empty.
6. Phone (Vercel only): open `/capture` in Safari/Chrome → *Add to Home Screen*.

## B. Automated checks

```
npm run test:db     # 66 passed
npm run test:share  # all pass
npm run lint        # 0 errors
npm run build       # clean
```

## C. Test checklist

- [ ] **`/season`**: tiles show changes vs. last season on this date; Admitted and
      Enrolled read "Decisions go out in March" / "Deposits come in by April";
      stage tabs switch the pace chart; hover shows the tooltip; the table fills;
      the approval panel says LOCKED; **Import live counts** is disabled.
- [ ] **`/apply`**: questionnaire loads; "Not sure where to start?" help appears
      under a question.
- [ ] **`/applicant/emma-r-8f3k2a`**: three pathways; **Share this possibility** →
      choose details → confirm preview → create link → the `/share/…` page opens;
      download a feed card.
- [ ] **`/admissions`**: Marcus Bell (submitted) can be reviewed and approved; the
      Spark panel on his page makes a `/spark/…` link that opens.
- [ ] **`/admissions/inquiries`** → **`/from/paul-revere`**: drafts copy out; public
      page shows the fictional stories.
- [ ] **`/pilot/people/[id]`**: **Draft** gives a portrait plus three pathways with a
      DRAFT watermark; signing removes it.
- [ ] **`/capture`**: say or type "Iris stayed after chapel to…" → Done → Save. On
      Vercel, do it from the phone too.
- [ ] **`/`** and **`/courses/[id]`**: roster, Capture, Pathway Portrait,
      🎲 Simulate Canvas activity.
- [ ] Wi-Fi off (local only): the fictional demo's AI steps fall back to canned
      text. `/season`, `/pilot` and `/capture` need Supabase, so they need a network.

## D. Run of show (about 15 minutes)

1. **`/season` (3 min).** "Our admissions season against the last three, on the same
   date." Tiles → pace chart on **Applications** → application rate → table.
   **Say these are sample figures.** Scroll to Data source: "The live Finalsite
   connection is built. It's waiting on your approval, not on engineering."
2. **The family experience (4 min).** **Walk through it with a fictional family** →
   Emma's three pathways → Share this possibility → preview → create link → public
   page and card. "An invitation, not a prediction."
3. **Admissions behind the scenes (3 min).** `/admissions` → approve Marcus (a person
   signs, not the AI) → his Spark link → `/admissions/inquiries` → outreach page.
4. **One database, whole lifecycle (3 min).** `/pilot`: the gate is LOCKED and the
   database refuses real students. Open a sample student → Draft → sign off. Then
   `/capture`, from the phone on Vercel.
5. **Close on measurement (2 min).** `/season` → "How we'll know if pathways help."
   The asks: approval for live counts, the pathway pilot and family consent, parent
   access to their own page, AI vendor terms.

Say: "Here's how we'll measure it; the first yield read comes in April."
Don't say pathways raised applications or yield. There's no data for that yet,
and the page says so.

## E. Things that can catch you out

- The sample shows inquiries 11% behind last season. It's fictional; say so, or
  edit `fixtures/sample/finalsite-funnel.json` and load the sample figures again.
- Phone width is untested for `/season` and the share modal. Check before showing
  either on a phone.
- On Vercel, open each page once before you present, so the first click isn't a
  cold start.
