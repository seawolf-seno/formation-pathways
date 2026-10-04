# Try Formation Pathways yourself: admissions guide

A self-guided walkthrough of everything built so far, on the live site:
**https://formation-pathways.vercel.app**

Allow about an hour. Use a laptop for most of it, and your phone for steps 7
and 8.

> **Please try everything on the fictional and sample students only.** Emma,
> Marcus, and the six students marked **Sample** on `/pilot` (Amara, Ben, Iris,
> Mateo, Roz, Theo) are invented. `/pilot` also lists a few real students in a
> small, consented pilot: please don't draft, capture, or start a Spark
> conversation for them. And please don't type a real family's name into the
> application form or capture.

## Before you start (for seno, before sending this)

1. **Approve her** after her first sign-in: `/pilot` → Staff → approve, role
   **Admissions**. Until then `/season`, `/pilot` and `/capture` say her account
   is waiting for approval.
2. **Refresh the fictional demo** so Emma and Marcus show their hand-written
   journeys: run `delete from demo_snapshots;` in the Supabase SQL editor (it
   also clears old demo share links).
3. **Sample class history:** on `/pilot`, while Blackbaud is *not* connected
   (the connection lasts an hour), click **Import from Blackbaud** once. The
   sample students then show their fictional classes.
4. **Season numbers:** `/season` now shows **live** whole-school Finalsite
   counts (totals only, no names). She's the right person to check them (step 2).

## 1. Sign in

1. Open **https://formation-pathways.vercel.app**.
2. Click **Continue with Google** and choose your `@pacificachristian.org`
   account. (Or enter your email and type the 6-digit code you're sent.)
3. **First time only:** seno approves your account. After that you stay signed
   in on this browser.

## 2. The admissions season, live: `/season`

Open **https://formation-pathways.vercel.app/season**.

- Real whole-school Finalsite counts, **totals only**: no names, and any group
  of 1–4 shows as "fewer than 5".
- Tiles compare this season with the last three **on the same date**. Click the
  stage tabs (Inquiries, Applications, …) to change the pace chart.
- **Please sanity-check the numbers against your own Finalsite reports.** In
  particular:
  - Does the fall 2027 class really have this few inquiries so far, or are this
    year's families filed under another school year?
  - Do the past seasons' totals look right?
  - "Admitted" counts families whose status for that year was *enrollment in
    progress, enrolled, not enrolling* or *parent declined*, dated by that
    season's Acceptance Friday. *Financial aid waitlisting* is **not** counted
    as admitted yet. Tell seno if it should be.
- **"How we'll know if pathways help"** at the bottom deliberately claims no
  result yet.

## 3. What a family sees: `/apply` and a family pathway

1. Open **https://formation-pathways.vercel.app/apply** and fill it in as an
   imaginary 8th grader. Try *"Not sure where to start?"* under a question.
2. Open the finished example:
   **https://formation-pathways.vercel.app/applicant/emma-r-8f3k2a**
   - Pick one of Emma's three pathways and scroll. **The road draws itself**:
     milestones appear one by one, branch into where it could lead, and a
     "glimpse" card pictures an ordinary day inside that pathway.
   - Click **Share this possibility**, choose the details, check the preview,
     then **Create link**. The `/share/…` page is what a family could send a
     grandparent. Download the image card too.

## 4. Behind the scenes in admissions: `/admissions`

Open **https://formation-pathways.vercel.app/admissions**.

1. Open **Marcus Bell** (awaiting review), read his pathways, type your name and
   click **Approve & get shareable link**. A person approves, not the AI.
2. On his page, the **Spark survey** panel: **Create link**, then open it. It's
   the short interest survey an applicant fills in without signing in.
3. Back on `/admissions`, open **Inquiries and prior-school outreach**. The
   drafted emails link to `https://formation-pathways.vercel.app/from/…`. Open
   one to see fictional stories from a feeder school.

## 5. One student's whole story: `/pilot` (sample students only)

Open **https://formation-pathways.vercel.app/pilot**, then a student marked
**Sample**. **Iris** is a good choice.

- **Where they are now:** grade, class of, advisor, and their classes by year
  as chips (Academics, Arts, Athletics). No grades, anywhere.
- **What lights them up:** see step 6.
- **Draft who they are today + 3 pathways:** the AI drafts a short portrait (for
  staff only) and three pathways, watermarked **DRAFT**. Click **Edit the
  pathways before signing** and change anything, including the milestones and
  the glimpse. Then **I've reviewed this. Sign as approved**.
- **Open it with Iris →** opens the student-and-family view of the *signed*
  pathways, with the same road animation as Emma's. Tap **This one excites me**
  and add a sentence: it's saved to her Pathway under your name.

You can read, draft and sign. Imports, consent records and staff approvals are
admin-only, so you won't see those controls.

## 6. Spark: what really lights a student up

Applications show the formal version of a student. Spark finds the real one.

1. On a sample student's page, click **Start a Spark conversation ✦**.
2. A night sky opens. Answer a few questions **out loud** (tap the gold mic) or
   by typing. Each answer becomes a star.
3. Tap the floating interests: once if you love it, **twice if you're
   obsessed**. Then a few quick "this or that" choices.
4. Optional: drop in a YouTube `watch-history.json` from Google Takeout. It's
   read on your device only and never uploaded, and you pick which channels to
   keep. Skipping is fine.
5. Watch the stars join into a constellation, then **Save my sparks**.
6. Back on the student's page, **Draft again from latest data**: the new
   pathways grow from those sparks, and milestones can say "grew from your
   spark: …".

Try it on your phone too, and tell seno how it feels on a small screen.

## 7. The classroom side: `/`

Open **https://formation-pathways.vercel.app** (the teacher roster).

- Nothing on the roster is a score or a red flag. It's sorted by who hasn't been
  noticed in a while.
- Click **Capture** on a student, type a sentence about something good you saw,
  **Review & tag**, then save.
- Open a student and draft a **Pathway Portrait** (a warm letter to parents,
  DRAFT until signed) or an **Admissions story** (the same evidence,
  anonymized).

## 8. Capture from your phone: `/capture`

1. On your phone, open **https://formation-pathways.vercel.app/capture** and
   sign in with **Continue with Google**.
2. Add it to your home screen: Safari *Share → Add to Home Screen*, or Chrome
   *Install app*.
3. Tap the mic and say something like *"Iris stayed after chapel to help stack
   chairs"*, tap **Done**, then **Save**. Choose a **sample** student only.

## Things that are normal right now

- **The AI is on for the fictional and sample students.** Every draft is
  written fresh, so wording varies. Every AI draft stays a DRAFT until a named
  adult edits and signs it.
- **What you create in steps 3–5 is kept while you're signed in.** A share link
  opened by someone who *isn't* signed in can occasionally show "not found", so
  test share links from your own signed-in browser.
- The first click on a page after a quiet spell can take a few seconds.

## Sending feedback

For each thing you notice, send seno: the page address, what you tried, what
happened (a screenshot helps) and what you expected. Wording matters as much as
bugs: flag anything a parent might misread, or anything that feels like a score
or a label on a student.
