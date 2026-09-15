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

```
git checkout -b <yourname>/<short-feature-name>
# make your changes
npm run lint
git push -u origin <yourname>/<short-feature-name>
```

Then open a pull request into `main` on GitHub, filling out the PR template.
You'll automatically be asked to add a reviewer — that's expected, the repo
owner is auto-requested on every PR.

A few things to know:

- **Direct pushes to `main` are blocked.** Everything goes through a PR.
- **CI runs automatically** (`npm run lint` and `npm run build`) and has to
  pass before your PR can be merged, on top of a manual review.
- **PRs are squash-merged.** Don't worry about keeping a tidy commit history
  on your branch — it'll collapse into one clean commit on `main`.
- **Pick up an issue labeled `good first issue`** if you're not sure what to
  work on — that's a curated backlog of scoped tasks.

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
