# October 5 board demo: run of show

About 15 minutes, on the live site **https://formation-pathways.vercel.app**,
alongside the Ruakh 2.0 deck (slides 4–7 are the demo). Present from your
**signed-in** laptop and phone.

**Two rules on stage:**
- **Never open a real pilot student on screen.** The `/pilot` roster lists
  real names, so go straight to the sample student by bookmark (below) and
  don't show the roster.
- **Only sample or fictional data in front of the board:** Emma, Marcus, and
  students marked **Sample** (Iris is the demo student).

## A. Tonight (about 45 minutes)

1. **Decide `/season`: live or sample.**
   - **Live** only if the admissions director has confirmed the numbers,
     especially the low fall 2027 inquiry count.
   - Otherwise switch to sample: in the Supabase SQL editor run
     `delete from admissions_funnel_counts where not is_sample;`. The page then
     shows "Sample figures (fictional)". You can re-import live after the
     meeting.
2. **Fresh fictional demo:** run `delete from demo_snapshots;`. This resets
   Emma and Marcus (hand-written journeys) and clears old share links and
   approvals, so Marcus is "awaiting review" again.
3. **Sample class history:** while Blackbaud isn't connected, open `/pilot` and
   click **Import from Blackbaud** once. Then close that tab: it lists real
   students.
4. **Prepare Iris** (Sample) and **bookmark her page**:
   `/pilot/people/<Iris's id>` (copy it from the address bar).
   - **Start a Spark conversation ✦**: a few answers and taps → **Save my
     sparks**.
   - **Draft who they are today + 3 pathways**. The AI takes 10–20 seconds;
     read it. **Edit** anything off, then **Sign**.
   - Click **Open it with Iris →** and bookmark that page too
     (`/pathway/<id>`).
5. **Bookmarks bar, in order:** `/season` · `/applicant/emma-r-8f3k2a` ·
   `/admissions` · Iris's page · Iris's pathway · `/pathway/<id>/spark`.
6. **Phone:** sign in (Continue with Google), open `/capture`, add it to the
   home screen, and do one test capture for Iris.
7. **Deck:** share it with anyone who needs it (it's private). On slide 4's
   notes, update the bracketed "sample figures [or: real numbers…]" line to tonight's choice.
8. **Rehearse once, out loud, with a timer.**

## B. Tomorrow, 30 minutes before

- Open every bookmark once to warm the servers (the first click after a
  quiet spell is slow).
- Laptop: close every other tab (especially `/pilot`), turn on Do Not Disturb,
  and set zoom to about 110% for the room.
- Wi-Fi: have a phone hotspot ready. Everything needs the network.
- Phone: Do Not Disturb, brightness up, `/capture` on the home screen.

## C. Run of show (about 15 minutes)

**1. The season (2 min): slide 4 → `/season`**
- "Our admissions season against the last three, on the same date."
  Tiles → **Applications** tab on the pace chart → the yield table.
- **Say which it is:** "These are live whole-school Finalsite totals, with no
  names, and groups under five hidden" *or* "These are sample figures."
- Scroll to **Data source**: "Finalsite is connected, read-only, totals only,
  approved by admissions."

**2. A family's first look (3 min): slide 5 → Emma**
- Pick a pathway. **Let the road draw itself**: milestones, the branches
  beyond graduation, the glimpse.
- "An invitation, not a prediction."
- **Share this possibility** → choose details → preview → **Create link** →
  the public page and card. "The family decides what anyone else sees."

**3. Behind the scenes (2 min): slide 6 → `/admissions`**
- **Marcus** → type your name → **Approve**: "A person approves, never the AI."
- **Inquiries and prior-school outreach**: one drafted email and its feeder
  page.

**4. One student, whole story (6 min): slide 7 → Iris's bookmark**
- **Where she is now:** facts and classes by year, from Blackbaud, with no
  grades.
- **What lights her up:** "Applications show the formal version of a student."
  Open **Spark** (bookmark), answer one question **out loud** (type if the room
  is loud), tap two interests (one twice), one this-or-that, and show the
  reveal: *"This is Iris, lit up."* Don't save; it's already done.
- Back on her page: the **signed** draft. "AI drafts, a named adult edits and
  signs." Point at the "grew from your spark" thread.
- **Open it with Iris →** pick a pathway → **This one excites me**. "This is
  the conversation a teacher has *with* her. The AI never talks to a student."
- **Send a link home ✉** (just point at it): "Families can do Spark together at
  home: a one-time, write-only link."
- **Phone:** `/capture` → "Iris stayed after chapel to help stack chairs" →
  Done → Save. "Any adult, ten seconds."

**5. Close (2 min): deck**
- The guardrails, in one breath:
  - consent per family and per use, enforced by the database
  - no scores on students
  - real students only in a small, signed-off pilot
  - AI for real students switched off until vendor terms are confirmed
- **How we'll know:** "The first yield read comes in April." Never say pathways
  raised applications or yield; there's no data yet, and the page says so.
- **The asks:**
  1. Confirm the AI vendor terms for student data (then real-student drafting
     can be switched on).
  2. Move hosting to a school-owned account, with a security review.
  3. Widen the pilot: family consent covering student voice and AI.
  4. Parent access to their own child's pathway page.

## D. If something goes wrong

| What | Do |
|---|---|
| A page is slow or spins | Keep talking; give it 10 seconds, then reload. It's a cold start. |
| AI draft is slow or odd | Don't draft live: Iris's draft is already signed. |
| Mic doesn't hear you | Type the answer. "It works either way." |
| A share link 404s | Open it in your signed-in browser, never an audience phone. |
| Wi-Fi drops | Phone hotspot. If it's still down, stay in the deck: slides 4–7 describe each step. |
| A real student's name appears | Move on calmly. Don't open the record. |

## E. Things not to say

- That pathways raised applications, yield or anything else. There's no data
  yet.
- Anything about a real student, even in passing.
- That the AI writes to families or students. It drafts for staff, and a named
  adult signs.

## Reference: where things persist

| | Vercel (production) |
|---|---|
| Sign-in | Every page except `/share/*`, `/from/*`, `/spark/*` |
| `/season`, `/pilot`, `/capture`, `/pathway` | Supabase (system of record) |
| Fictional demo (`/`, `/admissions`, `/applicant/*`, shares) | Snapshot in `demo_snapshots`, shared by every signed-in browser; reset with `delete from demo_snapshots;` |

Automated checks before any change: `npm run test:db`, `npm run test:share`,
`npm run lint`, `npm run build`.
