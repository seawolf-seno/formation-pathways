# Contributing

Thanks for helping build Formation Pathways. This is a short guide to get you
from "I have an idea" to "my PR is merged."

## Quickstart

```
git clone git@github.com:seawolf-seno/formation-pathways.git
cd formation-pathways
npm install
cp .env.local.example .env.local   # optional — the app runs fine without an API key
npm run dev
```

Open http://localhost:3000. Everything works offline — if you don't set
`ANTHROPIC_API_KEY`, AI drafting features fall back to canned-but-honest
placeholder text instead of failing. You don't need any real API key or
secret to contribute.

## Making a change

**Push your branch to this repo, not to a fork.** You have write access. A
PR from a fork gets no CI here, because the repo is private and GitHub doesn't
run Actions for forks of a private repo, so it can never merge.

```
git config user.email <the email on your GitHub account>   # once per clone
git checkout -b <yourname>/<short-feature-name>
# make your changes
npm run lint && npm run test:share && npm run test:db
git push -u origin <yourname>/<short-feature-name>
```

Use the email that's on your GitHub account (GitHub → Settings → Emails).
Otherwise GitHub and Vercel can't tell the commit is yours.

Then open a pull request into `main` on GitHub, filling out the PR template.
You'll automatically be asked to add a reviewer; that's expected, because the repo
owner is auto-requested on every PR.

A few things to know:

- **Direct pushes to `main` are blocked.** Everything goes through a PR.
- **CI runs automatically** (lint, the database guardrail tests, the unit
  tests and a production build) and has to pass before your PR can be
  merged, on top of seno's review. Your branch must be up to date with
  `main`: use **Update branch** on the PR, or rebase.
- **Pushing after an approval dismisses it**, so seno re-reviews what
  actually merges.
- **PRs are squash-merged.** Don't worry about keeping a tidy commit history
  on your branch: it'll collapse into one clean commit on `main`.
- **Pick up an issue labeled `good first issue`** if you're not sure what to
  work on: that's a curated backlog of scoped tasks.

## Testing on staging

Staging is a second database with **fictional students only**: six sample
students, sample families, a sample AP Physics 1 class. Click anything, save
anything; nothing there is real. `docs/staging.md` has the details.

1. **On your computer** (anyone): `npm run dev:staging`, open
   http://localhost:3000/login and sign in with your school address and the
   6-digit code from the email. The first time, ask seno to approve your
   staging account and pick its role (staff, teacher, admin). You only need
   to do this once.
2. **On a preview link** (what reviewers click): the red **Vercel** check on
   your PR is expected. Previews are built only for Developer seats on the
   school's Vercel team, and contributors are Viewers. When your PR is ready
   for a click-through, ask seno for a preview; he builds one from your PR
   and its link appears as a comment. As a Viewer you can open any preview
   once you're signed in to Vercel.
3. Say in the PR what you clicked through and what you saw, with a
   screenshot at phone width for anything families or staff use on a phone.

Never put a real student or family into staging, and never point your local
app at production.

## House style

This repo has real conventions documented in [`CLAUDE.md`](./CLAUDE.md) —
read it before you start, especially:

- **Reads vs. writes:** plain data-reading functions go in `lib/queries.ts`
  and are called directly from Server Components. All writes go through
  `"use server"` Server Actions in `lib/actions.ts`. Don't add new API routes
  for CRUD.
- **Claude calls never throw.** Every AI-drafting function has a
  canned-fallback path so the app never breaks if the API is down or a key
  is missing — follow that pattern for any new Claude call.
- **Product principles, non-negotiable:**
  - No real student names or data anywhere, ever — this is fictional-demo-data
    only until a privacy/consent review happens.
  - No numeric scores, rankings, or gamification (points, badges, streaks,
    leaderboards) — this app is a compass, not a dossier.
  - Every AI output is a labeled "Draft" until a named adult reviews and
    signs it off. There's no unsupervised send.

## Scope and collisions

Keep PRs small and scoped to one feature or fix. If you're about to touch
`lib/db.ts`'s schema, or a file you suspect someone else is already working
on, ask first (open an issue or comment on the existing one) so two people
don't build the same thing at once.

## Database changes (Supabase migrations)

seno manages the database. You write the migration; seno applies it.

1. Add **one** file to `supabase/migrations/`, named
   `YYYYMMDDHHMMSS_what_it_does.sql`, with a timestamp **later than the
   newest file on `main`**. CI fails a reused or older timestamp. If `main`
   gets a newer migration before yours merges, rebase and rename yours.
2. Every new table needs RLS policies, explicit `grant` statements (Supabase
   stops auto-granting new tables on 2026-10-30), a consent trigger if it
   holds per-student data, and cases in `supabase/tests/rls.test.mjs`.
3. Make the app work **before** the migration exists: the deploy and the
   migration land a few minutes apart, so return empty results or hide the
   feature, never a 500.
4. **Never apply a migration yourself**, and never connect to the live
   database. Local work uses the sample data and the staging database
   (`npm run dev:staging`). seno applies your migration to staging first,
   and then you can click through it there.

The PR gets a **needs migration** label automatically. seno applies it to
staging, checks the preview, applies it to production, then merges.

## Fizzy

Work is tracked on Fizzy cards. Put the card number in your PR ("Fizzy #34")
and post a short note on the card when you open the PR and when it merges.
