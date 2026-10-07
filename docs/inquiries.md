# Inquiries: our own form, sent on to Finalsite

Fizzy card #29. Families who are curious about Pacifica tell us about their child at **`/discover`**, on Formation Pathways. This is our own form, not Finalsite's. Admissions sees every inquiry at **`/pilot/inquiries`** and sends them to Finalsite with an import file. Referral codes are built in from the start, so a family's shared pathway can bring in the next family.

## Why an import file, not a live connection

Finalsite Enrollment's External API is read-only. Its documentation says: "Only GET requests are accepted; no data can be written back via the API." The supported way to create contacts is Finalsite's **Import Data** tool with a **Create** import. So:

1. Families submit at `/discover`. Each inquiry gets a permanent **FP id** (for example `FP-0A1B2C3D4E5F`).
2. Admissions downloads **new inquiries** from `/pilot/inquiries` as a CSV in Finalsite's Create-template format. They're marked as sent, so they won't come twice.
3. In Finalsite, **Settings → Import Data → Create**, using a saved mapping template.
4. The FP id is the child's `external_id` in Finalsite. The read-only API we already use can find the same family later, for example to see when a referred family applies.

## Putting it on the school website

Both are on `/pilot/inquiries`, ready to copy.

- **Link** (for "Request Info" buttons): `https://<app address>/discover?src=website`
- **Embed** (in place of the current Finalsite form on `/inquire`):
  ```html
  <iframe src="https://<app address>/discover?src=website&embed=1" title="Discover Pacifica"
          width="100%" height="1600" style="border:0;max-width:100%"></iframe>
  ```

Framing is allowed only on `www.pacificachristian.org` and `pacificachristian.org` (`next.config.ts`; change with `DISCOVER_EMBED_ORIGINS`). When the app moves to a school domain (`docs/hosting-move.md`), only the address changes.

`src=website` records that the family came from the website. A family's shared pathway links to `/discover?ref=CODE`. The database credits a referral only if the code belongs to a family that has inquired; an unknown code is ignored.

## One-time setup in Finalsite (admissions)

Before the first import, confirm these in Finalsite and set the matching settings in Vercel if anything differs.

| What | Our default | Setting |
|---|---|---|
| The status a new inquiry starts in | `Inquiry` | `FINALSITE_IMPORT_STATUS` |
| How a grade is written | `9` | `FINALSITE_IMPORT_GRADE_LABEL` (e.g. `Grade {n}`) |
| How a school year is written | `2027-2028` | `FINALSITE_IMPORT_YEAR_LABEL` (`{y}-{y1}`) |
| Separator in multi-select fields | `;` | `FINALSITE_IMPORT_LIST_SEPARATOR` |
| Current school field | `current_school` | `FINALSITE_IMPORT_FIELD_CURRENT_SCHOOL` |
| Interests field | `inquiry_interests` | `FINALSITE_IMPORT_FIELD_INTERESTS` |
| Sports field | `sports_inquiry_interests_ms` | `FINALSITE_IMPORT_FIELD_SPORTS` |
| Relationship values | Mother, Father, Guardian, Grandparent, Other | must match Finalsite's list |

The three custom fields above already exist on Pacifica's contacts (seen through the API). The labels on our form match Pacifica's current Finalsite inquiry form, so the values should match Finalsite's lists.

**Recommended:** create three custom fields so Finalsite keeps what only our form collects, then name them in the settings:
- the family's "one thing" (`FINALSITE_IMPORT_FIELD_ONE_THING`);
- the referral code (`FINALSITE_IMPORT_FIELD_REFERRAL_CODE`);
- the inquiry source (`FINALSITE_IMPORT_FIELD_SOURCE`).

Until they're named, those columns are left out, so the import never fails on a field that doesn't exist.

To check the file's shape without real families, an admin can add a fictional sample on `/pilot/inquiries` and use **Preview the file with samples**. Never import that file; samples are never in a real export.

## What the form collects, and why

- **The child:** first and last name, starting grade and year, and current school. Finalsite needs the name, grade and year.
- **One thing about the child,** in the parent's words, and interests. This is what makes a Formation Pathway particular.
- **The parent:** name, relationship, email, optional phone, and a complete household address. Finalsite's Create import requires an address for an in-workflow contact.
- **Consent.** Contact is required. The pathway is optional and says plainly that AI helps draft it before a staff member signs it. The wording version is stored with each inquiry.

**The consent wording in `lib/discover.ts` is a draft for leadership to approve.**

## Safeguards (supabase/migrations/20261009000000_inquiries.sql)

- **The form is closed until an admin opens it on `/pilot/inquiries`.** Opening records who approved it and where that approval lives (enforced by the database). It also needs the real-data gate open.
- **The public can do exactly two things:** ask whether the form is open, and submit an inquiry. Submissions go through `submit_inquiry()`, which accepts only the form's fields and checks every one.
- **Only admin and admissions can read inquiries.** Teachers and other staff cannot.
- **What a family sent can't be edited.** Only follow-up fields can change: status, Finalsite fields, and the date to delete by.
- **Each inquiry carries a delete-by date** (18 months by default).
- **Spam:** a hidden field and a minimum time to fill catch simple bots. Add a Vercel Firewall rate limit on `POST /discover` before opening it widely.
- **No AI touches an inquiry yet.** Pathways for inquiring families come in a later PR, and AI on real families waits on card #22.

## Not built yet (card #29)

- the welcome page built from the family's own words;
- the staff-signed pathway sent by email link;
- sharing with referral codes, the referred-inquiry view, and recording thank-yous;
- the counts-only report.
