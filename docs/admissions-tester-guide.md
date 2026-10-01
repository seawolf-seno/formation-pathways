# Try Formation Pathways yourself: admissions guide

A self-guided walkthrough of everything built so far, on the live site:
**https://formation-pathways.vercel.app**

Allow about 45 minutes. Use a laptop for most of it and your phone for step 7.

> **Everything here is fictional or sample data.** Please don't type a real
> student's or family's name anywhere, including the application form and
> voice capture. The real-student pilot is locked and opens only after
> leadership signs off.

## Before you start (for seno, before sending this)

1. **Custom SMTP, then the email code.** Supabase's built-in email only delivers
   to members of the Supabase organization's team, so without custom SMTP her
   sign-in email never arrives. (Don't add her to the Supabase team instead: that
   gives her the database dashboard.) Set up SMTP under Project settings →
   Authentication → SMTP (see `docs/system-of-record.md`, Setup step 2), then in
   Authentication → Emails add `{{ .Token }}` to the *Magic Link* and *Confirm
   signup* templates so the email carries a 6-digit code as well as the link.
2. **Approve her.** After her first sign-in, open `/pilot` → Staff, approve her
   account and set the role to **Admissions**. Until you do, she can open the
   fictional demo but `/season`, `/pilot` and `/capture` send her back to the
   sign-in page with a message that her account is waiting for approval.
3. **Sample figures.** On `/season`, check that the badge reads "Sample figures
   (fictional)". If it doesn't, click **Load sample figures** (only an admin can).
4. **Sample students.** On `/pilot`, check that the six sample students are
   listed (Amara, Ben, Iris, Mateo, Roz, Theo).

## 1. Sign in

1. Open **https://formation-pathways.vercel.app** and enter your
   `@pacificachristian.org` email.
2. Check your inbox for the 6-digit code (or click the link in the email, on
   this same laptop). Sign-in emails are limited to a few an hour, so request
   one code and wait a minute before asking again.
3. **First time only:** seno approves your account. After that you stay
   signed in on this browser.

## 2. The admissions season dashboard: `/season`

Open **https://formation-pathways.vercel.app/season**.

- Tiles at the top compare this season with last season **on the same date**.
- Click the stage tabs (Inquiries, Applications, …) and watch the pace chart
  change. Hover over it for the numbers on a given day.
- Scroll through the application rate and the yield table.
- **Data source** at the bottom: live Finalsite counts are built but switched
  off until leadership approves them. *Import live counts* is meant to be
  disabled.
- **"How we'll know if pathways help"**: the measurement plan. It deliberately
  shows no result yet, because families haven't used pathways yet.

Keep in mind that all numbers are made up, including "inquiries behind last
season".

## 3. What a family sees: `/apply` and a family pathway

1. Open **https://formation-pathways.vercel.app/apply** and fill in the
   questionnaire as an imaginary 8th grader. Try the *"Not sure where to
   start?"* help under a question.
2. Open the finished example:
   **https://formation-pathways.vercel.app/applicant/emma-r-8f3k2a**
   - Emma (fictional) has three possible pathways at Pacifica.
   - Click **Share this possibility**, choose which details to include, check
     the preview, then **Create link**. The `/share/…` page it opens is what a
     family could send to a grandparent. It works without signing in.
   - Download the image card too.

## 4. Behind the scenes in admissions: `/admissions`

Open **https://formation-pathways.vercel.app/admissions**.

1. Open **Marcus Bell** (awaiting review). Read his pathways, type your name as
   reviewer and click **Approve & get shareable link**. A person approves, not
   the AI.
2. On his page, the **Spark survey** panel: **Create link**, then open it. It's
   a short interest survey an applicant fills in without signing in.
3. Back on `/admissions`, open **Inquiries and prior-school outreach**. The
   drafted emails should link to `https://formation-pathways.vercel.app/from/…`.
   Open one of those pages; it shows fictional stories from a feeder school.

## 5. One student's whole story: `/pilot`

Open **https://formation-pathways.vercel.app/pilot**.

- The **leadership gate** reads LOCKED. While it's locked, the database itself
  refuses to hold any real student.
- Open a sample student, for example **Iris**. You'll see where she's been
  (application), where she is now (classes) and what staff have noticed.
- Click **Draft who they are today + 3 pathways**. You get a short portrait
  plus three pathways, watermarked **DRAFT**. Click **I've reviewed this. Sign
  as approved** and the watermark goes away, with your name on it. Nothing here
  ever goes to a family.

As admissions you can read and draft. Imports, consent records and staff
approvals are admin-only, so you won't see those controls.

## 6. The classroom side: `/`

Open **https://formation-pathways.vercel.app** (the teacher roster).

- Nothing on the roster is a score or a red flag. It's sorted by who hasn't
  been noticed in a while.
- Click **Capture** on a student, type a sentence about something good you saw,
  **Review & tag**, then save.
- Open a student and draft a **Pathway Portrait**: a warm letter to parents,
  DRAFT until someone signs it. The **Admissions story** next to it is the same
  evidence, anonymized for admissions materials.

## 7. Capture from your phone: `/capture`

1. On your phone, open **https://formation-pathways.vercel.app/capture** and
   sign in with the 6-digit code.
2. Add it to your home screen: Safari *Share → Add to Home Screen*, or Chrome
   *Install app*.
3. Tap the mic and say something like *"Iris stayed after chapel to help stack
   chairs"*, tap **Done**, then **Save**. If the mic misbehaves, use your
   keyboard's dictation button or type it. Only the six sample students can be
   chosen.

## Things that are normal right now

- **The AI writing is canned.** No AI key is connected yet, so every draft is
  pre-written sample text and can look the same across students. The flow is
  real; the wording will improve once the AI is switched on.
- **What you create in steps 3, 4 and 6 is kept while you're signed in.** A
  share link opened by someone who *isn't* signed in can occasionally show "not
  found", so test share links from your own signed-in browser.
- **Phone layout** of `/season` and the share window hasn't been checked yet.
  Tell us if it looks wrong.
- The first click on a page after a quiet spell can take a few seconds.

## Sending feedback

For each thing you notice, send seno: the page address, what you tried, what
happened (a screenshot helps) and what you expected. Wording matters as much as
bugs: flag anything a parent might misread, or anything that feels like a score
or a label on a student.
