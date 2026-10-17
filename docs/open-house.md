# Open House pathways (Fizzy #38)

For Open House, Wed 2026-10-21. A family scans a QR code, types their child's
first name, taps a few interests, and gets a personal Formation Pathway card on
their phone in seconds: two pathways, each with real Pacifica faculty to meet
and real projects to try. One Share button sends the card with:

> Formation pathways are more impactful in a community. Bring your friends along for the journey.

When a friend comes through that link and applies, the sharing family's
application fee is waived.

## How it works

| Who | Where | What |
|---|---|---|
| Family | `/oh` (public, from the QR) | One screen: name, grade, up to 3 interests, school (optional), parent email, consent. |
| Family | `/oh/[token]` (their private link) | The card, **Share with friends**, Save the image, friends who joined. |
| Friend | `/oh?ref=CODE` | The inviter's card on top, then the same form. |
| Staff | `/pilot/openhouse` (admin, admissions) | Big QR for signs, counts, every card live (refreshes every 15 s): **Looks good**, **Pull**, **Applied**, **Waive fee**. Feeder-school counts. |

## The one exception to "AI drafts, a named adult signs"

seno approved (2026-10-16) that Open House cards reach the family **before** an
adult reviews them, because the moment is the point. Guardrails instead:

- The AI only **chooses** from `fixtures/openhouse.json`: faculty (name + department,
  as already public), real projects, interests. It writes only a title and one
  sentence. `checkAiPathways` (`lib/openhouse.ts`) drops any id not in the
  catalog, long text, URLs, emails and banned words, and fills from a
  deterministic no-AI pathway. A failed or slow call (20 s) gives the no-AI
  version, never an error.
- No names reach the AI (the child's first name becomes `[STUDENT]`,
  `assertNoNames`). Fast model: `OPENHOUSE_MODEL`, default Haiku 4.5.
- Every card says "Drafted with AI" until staff tap **Looks good**, then
  "Reviewed by <name>". Staff can **Pull** a card instantly; the family then
  sees "being updated".
- Nothing is public until a parent or guardian confirms sharing. The public
  card (`/oh/s/CODE/card`) shows only first name + pathways.
- Only the server can write pathways: `openhouse_set_pathways` needs
  `OPENHOUSE_KEY`, whose sha256 hash is in `private.openhouse_keys`.
- Families are deleted after 18 months (`delete_after`).

Feeder-school lines are **counts only**, typed by admissions on the wall, and
shown only when 5 or more current students came from that school. No Finalsite
lookup and no other student's details.

## Before Wednesday (seno / leadership)

1. Apply `20261026000000_open_house.sql` (staging first, then production).
2. Pick a long random `OPENHOUSE_KEY`, set it in Vercel (Production and
   Preview), and add its hash in each database:
   `insert into private.openhouse_keys (key_hash) values (encode(extensions.digest('<key>', 'sha256'), 'hex'));`
   Without it, families get their card but it can't be saved (the join fails
   with a plain message).
3. Leadership opens inquiries (`/pilot/inquiries`); `/oh` stays closed until then.
4. For the fee waiver: leadership turns thank-yous on and sets the thank-you to
   "An application-fee waiver" (`/pilot/inquiries/referrals`). Until then the
   card shares without the waiver line and **Waive fee** stays hidden.
5. Type feeder-school counts on `/pilot/openhouse`.
6. Print the QR from `/pilot/openhouse` (it points at `/oh` on this host).
7. Tuesday rehearsal: five phones, real Wi-Fi, time from scan to card.
