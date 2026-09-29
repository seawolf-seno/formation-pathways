# Formation Pathways

A Day-1 vertical slice for Pacifica Christian High School: teachers capture
short voice/text observations of student formation moments, and AI drafts —
never sends — a forward-looking "Pathway" per student. Humans author, AI
drafts. See `CLAUDE.md` for the full product principles this app enforces.

**All student data is fictional**, invented for this demo.

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

## October 5 demo

Setup, test checklist and run of show: [docs/oct-5-demo.md](docs/oct-5-demo.md).

## October 5 family-pathway demonstration

After `npm run dev`, open `http://localhost:3000/applicant/emma-r-8f3k2a`.
Explore the three fictional pathways, open **Share this possibility**, choose
public details, confirm the preview, then create a link or download a card.
The public page works without staff navigation. This is a local demonstration;
production parent access is still unresolved. See [sharing notes](docs/pathway-sharing.md).

## 10-minute demo script

### 1. The roster (1 min)

Open **http://localhost:3000**. This is the home page every teacher sees —
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
- Every AI call has an offline fallback — this demo works with no internet
  and no API key, which matters when you're demoing on a school Wi-Fi.
- The word "record" never appears anywhere in this app. It's a Pathway.
