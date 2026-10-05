# October 5 board demo: run of show

About 15 minutes, on the live site **https://formation-pathways.vercel.app**,
with the Ruakh 2.0 deck (see `docs/board-deck.md`): slides 1–4 are the
overview, slide 5 hands off to the live demo, and slides 6–8 wrap up with what
we build next and the ask. Present from your
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
7. **Deck:** share it with anyone who needs it (it's private). Fill the
   bracketed budget cap in slide 7's notes. Know whether beat 01 is live or
   sample numbers.
8. **Rehearse once, out loud, with a timer.**

## B. Tomorrow, 30 minutes before

- Open every bookmark once to warm the servers (the first click after a
  quiet spell is slow).
- Laptop: close every other tab (especially `/pilot`), turn on Do Not Disturb,
  and set zoom to about 110% for the room.
- Wi-Fi: have a phone hotspot ready. Everything needs the network.
- Phone: Do Not Disturb, brightness up, `/capture` on the home screen.

## C. Run of show (about 18 minutes)

**Overview on slides (about 4 min): slides 1–4.** Cover, the problem, what
Ruakh 2.0 is, and what's real today. End slide 4 with "Let me show you."

**Slide 5, "Let's see it." Switch to the browser (about 9 min).** The four
beats on the slide, in bookmark order. The same script is in slide 5's speaker
notes.

**01 · The season (2 min): `/season`**
- "Our admissions season against the last three, on the same date."
  Tiles → **Applications** tab on the pace chart → the yield table.
- **Say which it is:** "These are live whole-school Finalsite totals, with no
  names, and groups under five hidden" *or* "These are sample figures."
- **Data source:** "Finalsite is connected, read-only, totals only, approved by
  admissions."

**02 · A family's first look (2 min): Emma**
- Pick a pathway and **let the road draw itself**: the milestones, the
  branches beyond graduation, the glimpse.
- "An invitation, not a prediction."
- **Share this possibility** → choose details → preview → **Create link** →
  the public page and card. "The family decides what anyone else sees."
- *If time allows:* `/admissions` → **Marcus** → **Approve**. "A person
  approves, never the AI."

**03 · What lights them up (2 min): Iris's Spark bookmark**
- "Applications show the formal version of a student."
- Answer one question **out loud** (type if the room is loud), tap two
  interests (one twice), make one this-or-that choice, then show the reveal:
  *"This is Iris, lit up."* Don't save; it's already done.
- Point at **Send a link home ✉**: "Families can do this together at home,
  with a one-time, write-only link."

**04 · One student's story (3 min): Iris's page**
- **Where she is now:** facts and classes by year, from Blackbaud, with no
  grades.
- Her **signed** draft: "AI drafts, a named adult edits and signs." Point at
  the "grew from your spark" thread.
- **Open it with Iris →** pick a pathway → **This one excites me**. "This is a
  conversation a teacher has *with* her. The AI never talks to a student."
- **Phone:** `/capture` → "Iris stayed after chapel to help stack chairs" →
  Done → Save. "Any adult, ten seconds."

**Back to the deck (about 4 min): slides 6–8**
- **6 · What we build next:** one consented database at the bottom, shared
  infrastructure in the middle, teachers, students and offices building on
  top. "Every new tool closes a break instead of becoming the next island."
- **7 · The ask:** five decisions:
  1. AI vendor terms
  2. widen the pilot with one consent form
  3. a school-owned home with budget caps
  4. families see their own pathway
  5. a teacher-and-student build pilot under an AI-use policy for minors
- **8 · Close:** how we'll measure ("first yield read in April"; never claim a
  result yet), then the last line, slowly.

## D. If something goes wrong

| What | Do |
|---|---|
| A page is slow or spins | Keep talking; give it 10 seconds, then reload. It's a cold start. |
| AI draft is slow or odd | Don't draft live: Iris's draft is already signed. |
| Mic doesn't hear you | Type the answer. "It works either way." |
| A share link 404s | Open it in your signed-in browser, never an audience phone. |
| Wi-Fi drops | Phone hotspot. If it's still down, talk through slide 5's four beats and go on to slide 6. |
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
