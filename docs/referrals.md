# Referrals and thank-yous

Fizzy #29. When a family inquires through another family's shared pathway, admissions confirms
the referral, and once the family they brought has applied (or enrolled, as leadership decides)
thanks the family who shared it. Everything is recorded in Formation Pathways. The thank-you is
quiet: no points, no public counts, no leaderboard (project principle #6).

**Needs:** `supabase/migrations/20261012000000_referral_thanks.sql` applied.

## The flow

1. A family shares a pathway (`/w/[code]`). Its **Tell us about your child** link carries the
   family's opaque code: `/discover?ref=CODE`, never a name.
2. A new family inquires through it. `submit_inquiry()` credits the code only if it belongs to a
   family that inquired (`source = 'share'`, `referred_by_code`).
3. **Admissions** opens **Inquiries → Referrals** (`/pilot/inquiries/referrals`), or the referral
   panel on the inquiry page, and taps **Confirm the referral**.
4. When the referred family applies, admissions sets their status to **applied**. The thank-you
   can then be **approved**: what it is comes from leadership's decision.
5. A named staff member sends it (a note, a call, whatever leadership chose) and taps **I've sent
   it**. Or **No thank-you for this one**, with a note.

## Rules the database enforces (`referral_thanks`)

- **A real referral only.** The referred inquiry's `referred_by_code` must be the referrer's
  `share_code`.
- **No self-referral.** It's refused if both have the same email, or the same street address and
  ZIP.
- **One step at a time:** confirmed → approved → sent, or declined (with a note) before it's sent.
  Each step records the signed-in staff member's own name. A sent or declined record is settled.
  Nobody deletes one through the app.
- **Off for real families until leadership decides.** An admin records the decision on the
  Referrals page: what the thank-you is, given on application or enrollment, the cap per family,
  who approved and where. Samples can go the whole way, so admissions can practise.
- **A cap per family** (`referral_thanks_cap`, default 3).
- **No cash.** The decision and each record refuse `$`, "cash", "gift card", Venmo, PayPal, Zelle.
- Admin and admissions only (RLS). Teachers and the public can't read it.

## The disclosure

A post made for a reward has to say so (the FTC's endorsement rules). While thank-yous are on (and
always for samples):

- the share text ends with `SHARE_DISCLOSURE` (`lib/family-share.ts`). The family can edit their
  words, but `withDisclosure()` puts the line back on what's actually shared;
- the public page (`/w/[code]`) adds `PAGE_DISCLOSURE` under the pathway.

`family_page()` and `public_share()` return `thanks` so the app knows. Both lines are **drafts for
comms/legal** (`docs/inquiry-launch.md`).

## The guardian's say-so

Nothing is shared until the person on the family page ticks "I'm [child]'s parent or guardian, and
I choose to share…". `family_share()` now takes that confirmation (`p_guardian`) and stores
`guardian_confirmed_at` on each share.

## The report

**How it's going** on `/pilot/inquiries` (`lib/inquiry-report.ts`): inquiries, from the website,
asked for a pathway, pathway signed, link sent, shared, inquired through a link, referrals
confirmed, applied or enrolled (and how many of those came through a link), thank-yous sent.
Counts only. Any count from 1 to 4 shows as "fewer than 5", as on `/season`. Samples are counted
in their own column.
