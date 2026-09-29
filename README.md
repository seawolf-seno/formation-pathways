# Formation Pathways

A Day-1 vertical slice for Pacifica Christian High School: teachers capture
short voice/text observations of student formation moments, and AI drafts —
never sends — a forward-looking "Pathway" per student. Humans author, AI
drafts. See `CLAUDE.md` for the full product principles this app enforces.

**All student data is fictional**, invented for this demo.

**Live:** https://formation-pathways.vercel.app (every page asks for a school sign-in except the
public `/share/*`, `/from/*` and `/spark/*` pages). Merges to `main` deploy there
automatically.

## Stack

Next.js (App Router) + Tailwind CSS 4, SQLite via `better-sqlite3`, Anthropic
SDK. No auth. Single repo, runs with `npm run dev`.

## How to run it

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. On first run, the SQLite database at
`data/formation.db` is created and seeded automatically with 12 fictional
students and 30 observations — nothing else to set up.

### Optional: enable live Claude calls

Without an API key, every AI step (clean-up, tag suggestions, discipline
check, portraits, admissions stories) runs on a canned offline fallback, so
the whole demo works with no network and no key. To see the real model output
instead:

```bash
cp .env.local.example .env.local
# then edit .env.local and set:
# ANTHROPIC_API_KEY=sk-ant-...
```

Restart `npm run dev` after adding the key.

### Resetting the seed data

Stop the dev server, delete `data/formation.db*`, and restart — it reseeds
from scratch. (Relative dates like "last witnessed 95 days ago" are computed
from each observation's real timestamp, so the story stays coherent no matter
when you run the demo.)

## Where things live

- `lib/seed.ts` — the 12 fictional students and 30 seeded observations.
- `prompts/*.txt` — the actual system prompts sent to Claude. Editable by
  faculty without touching code; loaded at runtime.
- `lib/claude.ts` — Claude calls, each with a canned fallback so a bad network
  never breaks capture, drafting, or the demo.
- `lib/actions.ts` — Next.js Server Actions (the only way data is written).
- `app/page.tsx` / `components/StudentList.tsx` — the roster.
- `app/students/[id]/page.tsx` — the Pathway view (timeline + portraits).
- `components/CaptureModal.tsx` — the capture flow (mic + fallback textarea).

---

## Testing it on your own (admissions)

Send [docs/admissions-tester-guide.md](docs/admissions-tester-guide.md). It walks
through every feature on the live site with sample data, step by step, and
starts with the four things to check before sending it (email code, approving
the tester's account as *Admissions*, sample figures, sample students).

## October 5 demo

Setup, test checklist and run of show: [docs/oct-5-demo.md](docs/oct-5-demo.md).

## October 5 family-pathway demonstration

Open **https://formation-pathways.vercel.app/applicant/emma-r-8f3k2a** (or `/applicant/emma-r-8f3k2a`
on `npm run dev`).
Explore the three fictional pathways, open **Share this possibility**, choose
public details, confirm the preview, then create a link or download a card.
The public page works without staff navigation or sign-in. On the live site,
create the share link and open it in one go: demo data there can reset between
server instances (see [the demo guide](docs/oct-5-demo.md#where-it-runs)).
Production parent access is still unresolved. See [sharing notes](docs/pathway-sharing.md).

## 10-minute demo script

Run it on the live site, signed in with your school account. Everything below
also works locally on `npm run dev` at `http://localhost:3000`. For the full
Oct 5 run of show, including `/season` and `/pilot`, use
[docs/oct-5-demo.md](docs/oct-5-demo.md).

### 1. The roster (1 min)

Open **https://formation-pathways.vercel.app**. This is the home page every teacher sees —
note what's *not* here: no scores, no ranks, no red flags. Just names, grades,
and how long since someone noticed something about them.

Point out **Ben Whitfield** at the top: sorted **most-stale first**, with a
quiet gold indicator — *"needs someone to move toward them"* — never red,
never alarming. He has only 2 observations, both months old. This is the
point of the roster: surface who's gone quiet, without shaming anyone.

Try the search box to show it's a real, filterable roster.

### 2. Capture a moment — under 30 seconds (3 min)

Pick any student (e.g. **Devon Brooks**) and click **🎙️ Capture**. This is
the core feature: *one tap, from the row, to capture*.

- Tap the mic button and dictate a sentence (Chrome only — narrate a small
  moment like *"Devon helped a freshman carry equipment again today, third
  time this week, nobody asked him to"*). If you're not on Chrome or the mic
  isn't available, just type it in the textarea — same flow either way.
- Tap **Review & tag**. Claude (or the offline fallback) lightly cleans the
  text, suggests 1–2 Formation Framework tags with a one-line rationale each,
  and checks whether this reads like discipline rather than formation — if it
  does, a gentle banner suggests reframing instead of silently logging it.
- Toggle tags, confirm your name, tap **Save to Pathway**.
- Watch the confirmation: **"Captured in N seconds."** That's the target
  metric made visible.

### 3. The Pathway view (2 min)

Click into a student with more history — **Maya Chen** or **Noor Hassan**
are good picks. Show:

- The **Formation tags** section — counts only, never scores, labeled chips
  (Spiritual Depth, Intellectual Courage, etc.).
- The **Timeline**, grouped by month, each moment attributed to the teacher
  who noticed it. This is the evidence base the AI drafts from — real,
  specific, dated, human-authored.

### 4. Draft a Pathway Portrait (2 min)

Still on the student page, click **Draft Pathway Portrait**. Claude reads
every observation and writes a warm, one-page letter to parents — citing
3–4 named moments, ending in two dinner-table questions.

Point out:
- The **DRAFT** watermark — it's there because nothing is final.
- You can **edit** the text directly before anything is final.
- The **Reviewed and signed by ___** field and **Sign** button — this is
  principle #1 made literal: *there is no unsupervised send.* Sign it, and
  watch the watermark disappear and the signature line appear.

### 5. Draft an anonymized admissions story (1 min)

Click **Draft anonymized admissions story**. Same evidence, rewritten in
third person with every identifying detail stripped — a ~150-word
transformation arc a school could use in admissions materials. Point out the
label: *"Fictional demo data — real stories require written family
permission."* — a real deployment would gate this on actual signed consent.

### 6. Wrap-up talking points (1 min)

- Every prompt Claude runs from lives in `/prompts` as plain `.txt` files —
  faculty own this vocabulary and can edit tone/wording without touching code.
- Every AI call has an offline fallback. The live site has no API key yet, so
  every AI step you see there is the canned fallback. Run locally with Wi-Fi
  off and you get the same behavior, which is useful on shaky school Wi-Fi.
- The word "record" never appears anywhere in this app. It's a Pathway.
