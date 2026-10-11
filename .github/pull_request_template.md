## What changed and why

<!-- One or two sentences. Link the Fizzy card: "Fizzy #34". -->

## How you tested it

<!-- e.g. "ran `npm run dev`, clicked through the class switcher on /classes/2" -->

## Screenshot (for any UI change)

<!-- Drag an image in here, or delete this section if there's no UI change. Phone width if families or staff will use it on a phone. -->

## Database (delete if no migration)

- [ ] One new file in `supabase/migrations/`, named `YYYYMMDDHHMMSS_what_it_does.sql`, with a timestamp later than the newest on `main` (rebased on `main` just before asking for review)
- [ ] Every new table has RLS policies, explicit `grant` statements, and a consent trigger if it holds per-student data
- [ ] New guardrails have cases in `supabase/tests/rls.test.mjs`
- [ ] The app still works before the migration is applied (empty results or a hidden feature, never a 500)
- [ ] I did **not** apply it to any Supabase project. seno applies migrations.

## Checklist

- [ ] Fictional/sample data only: no real student or family names or information anywhere, including screenshots
- [ ] Scoped to one feature or fix
- [ ] `npm run lint`, `npm run test:db` and `npm run test:share` pass locally
