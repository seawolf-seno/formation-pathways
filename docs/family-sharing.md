# Inquiring families: their page and sharing

Fizzy #29. After admissions signs a family's Formation Pathway, the family gets
their own page and can share it in a couple of taps. Every share links back to
`/discover?ref=…`, which is how referrals are credited.

**Needs:** `supabase/migrations/20261011000000_family_share.sql` applied.

## The flow

1. **Admissions** (`/pilot/inquiries/[id]`): sign the pathway, then **Make the family's
   link** in "Send it to the family". The link is shown once (only its hash is stored)
   and works for 60 days. Copy it, or open the ready-written email.
2. **The family** opens `/welcome/[token]`, with no sign-in: their words back, where their child
   could start, the signed pathway, then **Share**:
   - pick the pathway, a look (Night tide, Paper, Morning sky) and a size (Post 4:5, Story 9:16);
   - the public link is made as soon as they choose, so **Share** opens the phone's own
     share sheet at once, with the image and their words attached (Instagram, Messages,
     WhatsApp…). On a computer: copy the link, or Facebook / X / WhatsApp / Email / Text,
     Save image, and editable words.
   - **Stop sharing** ends every public link for the family.
3. **Friends** tap the link: `/w/[code]` shows the child's first name and that one pathway,
   and unfurls with the card image in iMessage, WhatsApp, Facebook and X. **Tell us about
   your child** goes to `/discover?ref=CODE`.
4. **Admissions** sees what was shared on the inquiry page, and referrals in the inbox
   ("Shared by…", "Brought N families").

## What is public

| Public at `/w/[code]` | Never public |
|---|---|
| Child's first name; one signed pathway's name, glimpse, first semester, up to three horizon items; the mentor's **department** | Surname, parent names, email, phone, address, school, grade, the family's own words, the other pathway, any draft |

- Only **signed** pathways can be shared, and signed pathways are read-only, so a share
  always shows what staff signed and the family chose.
- A share stops when the family stops sharing, admissions closes the inquiry, or (for the
  family page) the link expires, is ended, or the staff member who made it is deactivated.
- The prose is AI-drafted and staff-signed: it can mention a first name, a hobby or a place.
  The family sees the exact card before sharing.
- `/w/*` is GET-only and `noindex`; `/welcome/*` registers two actions
  (`lib/family-actions.ts`), and the database functions check the token again.
- Graduate stories on the family page are the demo's invented ones, so only fictional
  sample families see them. Real ones need graduates' consent.

## Cards

`lib/family-card.tsx`: Lora + Inter (`assets/fonts`, OFL), brand colors, the seawolf pup
on the waves (`lib/seawolf-svg.ts`, an original drawing, not the mascot artwork). The
official logo is white and never recolored: on light looks it sits on a navy badge. Story
text stays clear of the top and bottom 250px that Instagram covers.

## Open decisions for leadership

1. **Guardian consent to share.** The page says what's public and offers Stop sharing, but
   the inquiry consent wording doesn't mention sharing yet.
2. **The referral thank-you.** The page promises only that "we can thank you".
3. **Email delivery.** Staff send the link from their own email for now.
