# Family pathway sharing

A family whose Pathway page Pacifica has approved can pick the one Pathway that
feels most like their child, choose what to show, preview exactly what others
will see, and share it: a link with a rich preview, plus a downloadable image
for an Instagram post or Story. It is an invitation for other families to
discover Pacifica.

Demo scope: fictional applicants only, like the rest of the admissions demo.

## What is public, and what is not

There is exactly one public surface, `/share/[token]` and its PNG at
`/share/[token]/card`. Everything else, including `/applicant/*`, stays behind
sign-in in production (`proxy.ts` exempts only `/share/`).

The public page renders a **snapshot** (`PublicShareContent`, `lib/share.ts`)
copied into the `pathway_shares` table when the family confirms the preview.
It never reads the applicant record, so what the family previewed is what is
public, and later edits or regeneration cannot change or leak into it.

| Always | Only if the family opts in | Never |
|---|---|---|
| First name, Pathway name, one chosen sentence | Four-year horizon (max 3), stretch challenge, mentor's **department** | Last name, essays or answers, a teacher's name, grade, status, seed observations |

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
