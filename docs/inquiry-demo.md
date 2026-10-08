# Inquiry demo: a walkthrough for admissions

Try the whole family inquiry flow on fictional families before anything goes
public. Nothing here is sent to Finalsite or to a family.

**Before you start:** seno applies `supabase/migrations/20261010000000_inquiry_pathways.sql`.
You need to be signed in as **admin** or **admissions**.

## 1. Fill in the form as a family would (5 min)

1. Open `/pilot/inquiries` → **Fill in the form** (or go to `/discover`).
2. Signed in, the form runs in **test mode** (gold banner), even while it's closed to the
   public. Fill it in as a parent would. Put something real-sounding in "One thing a
   brochure would miss": that sentence is what the pathway grows from.
3. Send. The thank-you links to the saved inquiry. It's marked **Sample**.

To see referrals: copy a sample's link from its family page (`/discover?ref=CODE`), open
it, send another test inquiry. The inbox shows "Shared by …" and "Brought 1 family".

## 2. Or load five demo families (1 min)

**Load demo families** adds Wren, Jonah, Lucía, Eli and Sienna (all invented). Wren and
Jonah come from schools with graduate stories, so their page shows "Others who came from
your school".

## 3. Draft and sign a pathway (2 min)

1. Click a child's name in the inbox.
2. **Draft a Formation Pathway**. About a minute. It uses only what the family wrote, the
   current school, grade and interests.
3. Six pathways come back. Keep the up to three that sound like this child, then **Sign**.
   Your name is recorded; a signed pathway can't be edited (draft again instead).

## 4. See what the family sees

**See what the family sees →**: their words back, programs that fit their interests,
graduate stories, the signed pathway as a journey, and a share card with their own
referral link.

## Questions to answer while you test

- Does the pathway sound like the child the parent described, or like any child?
- Would a parent forward this page? Would they post the card?
- Is anything on the page something we couldn't actually deliver?
- What should the thank-you for a referral be? (Needs leadership; the page promises
  nothing yet.)

## What's not ready for real families

- **The form is closed** until an admin records leadership's approval of collecting
  family details and the consent wording (`lib/discover.ts`).
- **AI for real families is off** until the Anthropic terms for student data are
  confirmed (`AI_REAL_STUDENTS=on`, Fizzy #22). Until then a real inquiry can be
  received and sent to Finalsite, but not drafted.
- **Sending the page to a family** (emailed link) and the referral thank-you are the next PR.
- The graduate stories are the demo's fictional set; real ones need graduates' consent.
