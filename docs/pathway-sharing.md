# Family pathway sharing

A family whose Pathway page Pacifica has approved can pick the one Pathway that
feels most like their child, choose what to show, preview exactly what others
will see, and share it: a link with a rich preview, plus a downloadable image
for an Instagram post or Story. It is an invitation for other families to
discover Pacifica.

Demo scope: fictional applicants only, like the rest of the admissions demo.

## What is public, and what is not

The family-sharing public surface is `/share/[token]` and its PNG at
`/share/[token]/card`; the existing outreach prototype also has `/from/*`.
These exceptions are read-only (GET/HEAD); POSTs return 405 so public pages
cannot bypass the staff gate for Server Actions. `/applicant/*` remains
behind school sign-in in production.

The public page renders a **snapshot** (`PublicShareContent`, `lib/share.ts`)
copied into the `pathway_shares` table when the family confirms the preview.
It never reads the applicant record, so what the family previewed is what is
public, and later edits or regeneration cannot change or leak into it.

| Always | Only if the family opts in | Never |
|---|---|---|
| First-name field, Pathway name, one chosen sentence | Four-year horizon (max 3), stretch challenge, mentor's **department** | Separate surname, application-answer, grade, status, and seed-observation fields |

Approved narrative text may itself quote application details or names. Field selection does not anonymize prose. The family preview explicitly calls this out; it no longer promises that names or essay details can never appear.

Other rules, enforced in code:
- Sharing requires the applicant to be `approved` or `enrolled`; the staff
  approval gate is unchanged. A share of an applicant who later drops out of
  those states stops resolving.
- Tokens are 128-bit random (`randomBytes(16)`), separate from the applicant
  token. Families can stop sharing at any time; revoked links return 404.
- Public pages are `noindex`. Link previews (Open Graph) still work.
- Stored content is re-validated on read (`parsePublicShareContent`); unknown
  keys are dropped.
- Card copy: "An invitation, not a prediction."

`npm run test:share` covers these rules; CI runs it.

## Formats

| Format | Size | Use |
|---|---|---|
| feed | 1080x1350 | Instagram/Facebook post |
| story | 1080x1920, text kept clear of the top and bottom 220px | Instagram Story |
| og | 1200x630 | Link preview in iMessage, WhatsApp, Facebook |

Query: `/share/[token]/card?format=feed|story|og`, add `&download=1` to download.

## Open decisions for Mr. Eno (not decided by this change)

1. **Public route approval.** `/share/*` is the first unauthenticated surface in
   production. Confirm this is acceptable before deploying.
2. **Family access to their own page.** In production `/applicant/*` still
   requires an `@pacificachristian.org` sign-in, so a parent cannot reach the
   share controls. Either exempt `/applicant/*` (the token is 32-bit, so
   lengthen it first) or deliver the page another way.
3. **"Discover Pacifica" destination.** Defaults to
   `https://www.pacificachristian.org/admissions`; set
   `NEXT_PUBLIC_ADMISSIONS_URL` to change it. This URL is an assumption.
4. **Highlight sentences** come from AI-drafted text a staff member approved and
   the family previews. A scan for faculty names inside highlight sentences is
   not implemented; the mentor line is protected structurally, not the prose.
5. **Applicant consent.** Guardian consent for public sharing of a minor's
   Pathway needs a school policy; the in-page copy is not a substitute.

## Not built yet

QR code on the card, custom Lora display font in the PNG (currently the
default sans), short animated/video version, a "shared" indicator in the
admissions staff view.

## Inquiry stage: prior-school outreach

Once admissions knows only a family's prior school (before essays, parent
questionnaire or interview), staff can send an encouraging three-message
sequence (day 0, 5, 12) that features Pacifica students who came from the
same school. Demo: `/admissions/inquiries` (staff) and `/from/[school]` (public).

- **Public page has no personal data.** `/from/paul-revere` shows only
  consent-confirmed stories chosen by the school in the URL; unknown schools
  fall back to the general set (`/from/all`). Safe to forward to a friend.
- **Consent gate.** `alumni_stories.consent_confirmed` must be 1 or the story is
  never read (`getConsentedAlumniStories`, tested). The demo stories are
  fictional (`is_fictional = 1`) and labeled on the page. Before any real story
  is added, the consent it relies on must be confirmed against what the
  enrollment consent actually covers (public/marketing use, naming, minors).
- **Drafts only.** Messages are deterministic templates, not AI-written, and
  nothing sends from the app. A staff member copies and sends them.
- **Honest copy.** Drafts talk about *other* students and never claim to know
  the inquirer.
- **Mid-application ideas.** `/apply` shows a "Not sure where to start?" panel
  under each question, from `prompts/admissions-question-help.txt` (editable by
  staff). They are things to think about, never suggested answers.

Open: inquiries are seeded, not captured; a real intake (Finalsite or a form)
and an email-sending path (with unsubscribe and consent for minors) still need
Mr. Eno's decision. `/from/*` is a second public route to approve.


## September 25: pathways-first presentation

The October 5 experience opens directly at `/applicant/emma-r-8f3k2a` on the
local demo. No dashboard is part of this journey. Three selectable possibilities
lead to a focused first-semester, mentor, stretch, and horizon view. Sharing opens
in a keyboard-dismissable modal with the current pathway selected.

Optional details start off. Changing the selection clears the preview confirmation.
Confirmation is a UI review aid, not a stored guardian-consent policy or server-side
consent record. The original staff approval check still runs on share creation.
The public page renders all selected details as HTML, while feed/story/OG PNGs
are deliberately shorter headline cards with bounded text and a fictional-demo label.
Download copy explains this difference. Revoked routes and images return 404;
responses use no-store, though saved images and third-party cached previews cannot
be recalled.

### Verification for this revision

- Lint: no errors (two pre-existing unused-variable warnings in Canvas integration).
- 13 sharing/inquiry tests and 46 local database policy checks pass.
- Production build and TypeScript pass.
- Browser: selected a different pathway, opened its share preview, opted into a
  department, confirmed and created a fictional share, viewed the public HTML and
  generated feed PNG, revoked the link, and observed a 404 on reload.
- HTTP: public share POST returns 405.
- Desktop layout visually inspected. Mobile CSS is present; device-size browser
  verification remains to be completed because the available viewport override
  did not change the actual viewport.

This remains a local fictional demonstration. Production family authentication,
persistent share storage on serverless hosting, and school launch approval remain
open; no live Supabase data or deployed settings were changed.
