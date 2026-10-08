# What reaches the AI: names removed

Leadership approved AI drafting on real students (Fizzy #22) on one condition:
student data sent to Anthropic is anonymized. This is how the app does that, and
what it can't do.

## Every call that can carry a real person

| Where | What's sent | Code |
|---|---|---|
| Pathway draft (`/pilot/people/[id]`) | grade, stage, previous school, interests, activities, application answers, course titles, teacher comments, staff observations, Spark answers | `pathwayInput` |
| Capture cleanup (`/capture`) | the dictated or typed observation | `draftCaptureAction` |
| Inquiry pathway (`/pilot/inquiries/[id]`) | the parent's "one thing", current school, grade, interests | `inquiryInput` |

All three go through `lib/sor/ai-input.ts` → `lib/sor/anonymize.ts`. The fictional
demo (`/apply`, `/students`) and `npm run eval:pathways` use invented people; the eval
drafts through the same anonymizer so its results match the live app.

## What's replaced, before anything leaves the server

- **The student**: first, last and preferred names become `[STUDENT]`; the surname alone
  (as in "the Okafor family") becomes `[FAMILY]`.
- **Everyone we know of**: the parent on an inquiry (`[PARENT 1]`), every student on the
  roster the staff member can see (`[PERSON n]`), and every staff name in the record:
  advisor, course teachers, observation authors, the person drafting (`[STAFF n]`).
- **Contact details and ids**: emails, phone numbers, links, street addresses and numbers of
  six or more digits become `[EMAIL]`, `[PHONE]`, `[LINK]`, `[ADDRESS]`, `[NUMBER]`.
- Names that are also words (Grace, Hope, Will, Park…) are replaced only when capitalized.
  In dictation, near-miss spellings of names five letters or longer are caught too
  ("Okonko" for "Okonkwo").

Then `assertNoNames` checks the whole payload again. If any known name is still there,
nothing is sent and staff see "Stopped before sending". When the draft comes back, the
placeholders are swapped back to names on our server, so staff read "Levi", not
`[STUDENT]`. The name map never leaves the server. Prompts tell the model to keep
placeholders exactly and never guess a name (`prompts/placeholders.txt`).

## What stays, on purpose

- **Grade, stage, entry year, observation dates, course titles.** Not identifying on
  their own, and the pathways need them.
- **Previous or current school.** It's the most useful detail for a pathway that's
  unmistakably this student's. A school name with no person's name is not
  identifying for a school our size. If leadership wants it removed, it's one line in
  `ai-input.ts`; expect blander pathways.
- **Faculty named in `prompts/pacifica-context.txt`.** Public information, in the system
  prompt, not student data.

## What it can't catch

A name that isn't in our records: a sibling ("my brother Sam"), a friend from another
school, a coach outside Pacifica, a short first name misheard by speech-to-text ("Levy"
for "Levi"). On its own a stray first name doesn't identify a student, but check:

**Every person page and inquiry page has "What the AI sees (names removed)"**, the exact
text a draft would send. Read it before drafting, especially the first time for each
student. Tests: `tests/anonymize.test.mjs`.

## Anthropic's side

The API doesn't train on inputs by default. Retention and any zero-data-retention
arrangement are covered by the school's agreement with Anthropic (#22).
