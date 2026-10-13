# Opening the family inquiry flow: what's left, and drafts to decide on

Fizzy #29. The software is built: inquiry, instant welcome, staff-signed pathway, the family's
link, sharing with a guardian's say-so and an honest disclosure, referrals, thank-yous and a
counts-only report. What's left is **decisions people make**, a **design pass with real
photography**, and a **pilot with real families**. Everything below is a draft for the people
named to change. Nothing here is approved.

## 1. Leadership decisions

Record each one where the app asks for it. The app stays closed until then.

| Decision | Where it's recorded | Draft / recommendation |
|---|---|---|
| Collect prospective families' details here | `/pilot/inquiries` → Open the form | Approve for a 5–10 family pilot first |
| Consent wording | `lib/discover.ts` (`INQUIRY_CONSENT_VERSION`) | Below |
| How long we keep an inquiry that goes nowhere | `delete_after` (18 months now) | 18 months, one admissions cycle and a half |
| The referral thank-you | `/pilot/inquiries/referrals` → Turn thank-yous on | A handwritten note from the Head of School, on **application**, at most 3 per family |
| AI on real families' words | `AI_REAL_STUDENTS=on` (done for students, card #22) | Same anonymization applies to inquiries already |

### Consent wording (draft v2)

The form today (`2026-10-v1`):

> Pacifica Christian may contact me about admissions using the details above, and may keep this
> inquiry for up to 18 months if we don't apply.

> Please prepare a Formation Pathway for my child from what I've shared. It's drafted with the
> help of AI, then reviewed and signed by a member of the admissions team before we see it.

Suggested additions for v2:

- To the pathway consent: "*Names are removed before anything is sent to the AI service.*" (True:
  `lib/sor/anonymize.ts`.)
- A one-line privacy note under the button: "*We use what you share only for admissions at
  Pacifica. We never sell it or share it outside the school, except with the services that run
  this page and our admissions system. Ask us to delete it any time: admissions@…*" (Confirm the
  vendor list with IT: Supabase, Vercel, Anthropic, Finalsite.)
- Sharing is asked **at the moment of sharing**, by the parent, on their own page ("I'm [child]'s
  parent or guardian, and I choose to share this pathway with [child]'s first name. I can stop
  sharing at any time."). Nothing is shared without it. Leadership should confirm that's enough,
  or that the inquiry form should mention it too.

Changing the wording: edit `lib/discover.ts` and bump `INQUIRY_CONSENT_VERSION`. Every inquiry
stores the version it was given.

## 2. Comms / legal

- **The disclosure on shared posts** (FTC endorsement rules: a post made for a reward has to say
  so plainly). Drafts in `lib/family-share.ts`:
  - in the post: "(Pacifica may send our family a thank-you if you inquire through this link.)"
  - on the shared page: "The family who shared this may receive a small thank-you from Pacifica
    if you inquire through their link."

  They appear only while thank-yous are on. The family can edit their words, but the line is
  always added back to what's shared.
- **Social media policy for minors.** The child is 13–14. What's public is the child's **first
  name** and one signed pathway (no surname, school, photo, or the family's own words). The
  parent shares, never the child. Questions for whoever owns the policy:
  1. Is a first name plus a pathway description acceptable on a parent's public post?
  2. Should the school ever repost a family's share? (The app has no way to, today.)
  3. Does the school's photo/media release need to cover this? No photo of the child is used.

## 3. Design pass

The card asks for an editorial keepsake, not AI slop.

### Shot list (real photography of Pacifica, no stock, no AI images)

One strong image per place a family meets us. Landscape and portrait of each.

1. **The welcome hero:** a student at work in a real place: the Makers Space bench, a seminar
   table, the Wolf Shack counter. Hands and the work, faces optional.
2. **Programs** (one each, matched to the five interest areas): STEM Scholars lab or drone field;
   a Philosophy & Theology seminar mid-conversation; PACARTS backstage or the i.Sight Festival;
   The Wolf Shack; the Wolfpack student section at a home game.
3. **A first week:** chapel from the back of the room; a home-game crowd; a lunch table.
4. **Share cards:** texture only (water, sand, the campus's light), never a student's face. The
   card carries the child's name, so no other child appears with it.
5. **The shared page (`/w/…`):** one wide campus image a stranger would understand.

Consent: every student in a photo needs the school's media release on file. Ask comms which
photos already have it.

### Review checklist (with an art or design teacher)

Go through `/discover`, the welcome, a family page, all three card looks in both sizes, and
`/w/…`, on a phone:

- One idea per screen; nothing competes with the family's own words.
- Navy, gold and Pacific blue used sparingly. Lora headings, Inter body, no third font.
- No emoji, sparkle icons, gradients-for-their-own-sake, or "AI" visual tropes.
- Copy follows the STYLE rules in `prompts/unique-pathways.txt`: no contrast formulas
  ("not X, but Y"), no stock phrases, no em dashes in family-facing copy.
- Would a family print the card? Would they post the Story size?
- Read every screen aloud as a parent. Anything salesy, clinical, or that promises what we can't
  deliver comes out.

### Five real families

Before opening widely: 5 families from the current inquiry pool, chosen by admissions, using the
real form with leadership's approval recorded. Watch one or two do it in person. Ask the same
questions as the admissions phone test (`docs/admissions-phone-test.md`), plus: "Would you share
this? Why or why not?"

## 4. Before opening the form to the public

1. Merge and deploy; seno applies `20261012000000_referral_thanks.sql`.
2. **Vercel Firewall rate limit** on `POST /discover`: for example 5 requests per minute per IP,
   then deny. The database now refuses more than 3 inquiries a day per email and pauses past 40
   in ten minutes, but that's the backstop, not the front door.
3. Confirm the Finalsite import settings (`docs/inquiries.md`).
4. Record leadership's approval on `/pilot/inquiries`; if thank-yous are on, record that decision
   on `/pilot/inquiries/referrals`.
5. Rewrite "A first week" (`FIRST_WEEK` in `lib/discover.ts`) in admissions' own words.
6. Graduate stories: real ones need each graduate's consent. Until then, only sample families see
   the demo's invented stories.
