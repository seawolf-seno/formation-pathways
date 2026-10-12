# The Mastery Hub browser extension

A small Chrome extension (`extensions/mastery-hub/`) that does two things for a teacher:

1. **Khan Academy key skills, no uploads.** While you're signed in to Khan Academy, it reads your
   class's **Reports → Skills** report the way your own browser already loads it. It sends the
   hub your key skills at **proficient** (counts as Proficient) or **mastered** (counts as
   Extending). It does this every three hours in a background tab, whenever you open that report
   yourself, and on **Sync Khan now**.
2. **Tag any page.** On any https page (a YouTube video, a PhET sim, an article), open the
   extension, pick the class and the standard or unit, and save. Students see it with that
   standard's next steps; YouTube videos join the video shelf.

It never stores or sends a Khan password, and nothing goes anywhere but your own hub.

Khan Academy's help center asks people not to use "scraping tools, bots, or other tech to copy
or extract data" from their site. seno decided (2026-10-12) to accept that risk to his own Khan
account rather than pay a third party for Khan's official sync. The extension only reads what
Khan's own report page loads in your browser, no more often than every three hours.

## Install (once per Chrome)

1. Get the repo (or just the `extensions/mastery-hub` folder) onto your computer.
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose
   `extensions/mastery-hub`.
3. Pin it (the puzzle-piece icon → pin **Pacifica Mastery Hub**).

Later the school's Google Admin can push it to teachers' Chrome instead.

## Connect it to the hub

1. In the hub, open **/mastery** → **Browser extension** → **Connect the extension**. A code
   starting `fpx_` appears **once**.
2. Open the extension, check the hub address (production is
   `https://formation-pathways.vercel.app`), paste the code, **Connect**.

Each connection lasts 180 days. **Revoke** it on /mastery at any time; a revoked code stops
working at once. The hub keeps only a hash of the code.

## Khan Academy, step by step

1. **Link the class.** On the course page → **Course settings** → **Khan Academy class code**.
   That's the 8 letters and numbers after `/teacher/class/` in your Khan class's address (AP
   Physics 1 P5 is `7PZVAQDF`).
2. **First sync.** In the extension, **Sync Khan now**. It opens your skills report in a
   background tab, sends the skill list, and closes the tab (about half a minute; you need to be
   signed in to Khan in that Chrome).
3. **Pick key skills.** On the course page, under **Khan Academy key skills**: for each unit,
   tick up to **three** skills and the standard each one shows (a suggestion is marked when a
   skill's name matches a standard). Only these count.
4. **Students.** Khan students are matched to your roster by exact name in your browser. Anyone
   not matched shows in the extension with a **Link to…** list; pick their name once.
   Unmatched Khan students never reach the hub.
5. Sync again (or wait for the next automatic one). Each student's key skills at proficient or
   mastered appear as Khan Academy evidence. A student who moves from proficient to mastered gets
   one more piece of evidence; the same level again adds nothing. Below proficient isn't counted
   (and is never held against them).

The popup shows each class's last sync, what it added, and the Khan level words it saw, so you
can confirm "proficient" and "mastered" are the ones Khan uses. Pausing Khan Academy on the
course page stops the extension's syncs for that course.

## How it's built (for whoever maintains it)

- **Data path.** `khan-main.js` runs in Khan's page and copies the two responses Khan's skills
  report loads (`KAClassroom_GetExerciseSkills`, `KAClassroom_GetCourseExercises`). It never
  calls Khan's API itself; Khan's query hashes change with their deploys, so the extension rides
  on Khan's own page instead. `khan-relay.js` passes them to `background.js`, which matches
  students (`match.js`), keeps key skills at proficient/mastered, and posts to the hub.
- **Hub routes** (`app/api/mastery/extension/{context,khan,tag}`): bearer token only, no session.
  Each one calls a token-checked database function (`20261022000000_mastery_extension.sql`)
  that checks:
  - the token (hash, expiry, revocation, an active teacher or admin);
  - that the course is the teacher's own;
  - the roster and the `mastery_records` consent.
- **Database.** Key skills are capped at three per Khan unit. Only key skills turn into evidence.
  Tagged resources go in `mastery_course_resources`, merged into the course's standards for its
  pages (the shared standard set isn't changed).
- **Tests.** `supabase/tests/rls.test.mjs` ("browser extension") and `tests/mastery.test.mjs`
  (matching, levels, merging).
