# Running the Spark Lab

The Spark Lab compares three ways for a student to show what lights them up, so we can keep the one teens find most like them and that grows the most distinctive pathways. Each sitting runs two of the three, back to back, in an order chosen by rotation:

- **Original**: three open questions, tap interests (twice = obsessed), this-or-that, optional YouTube history.
- **Finish the sentence**: "I could teach a 10-minute class on…", said aloud or typed, with one gentle "give one specific example" nudge.
- **Swipe**: 18 specific cards ("Restoring old things so they work again"); *So me ✦* asks why in a few words.

After each one the student answers **"Did that feel like you?"**; after both, **"Which one felt more like you?"** Nothing is scored or shown back to them.

## Before the first real sitting

1. **Practice once with a fictional sample student** (anyone marked *Sample* on `/pilot`). Go all the way to the end and check their page shows both sessions, labelled with the format and reaction.
2. For each pilot student, check their page's Consent box has **Student voice**. Without it the Spark page won't open.
3. Allow about 12 minutes. Use your signed-in laptop or tablet; the student holds it.

## During the sitting

- Open the student's page → **Start a Spark conversation ✦**. (*one format only* runs the original flow by itself, for when time is short.)
- Say what the intro says: no right answers, nothing graded, and honest beats nice, because we're choosing which way works best for students.
- Step back. Let them answer without an adult reading over their shoulder.
- Each format **saves as soon as it's finished**, so closing early keeps what's done. If a sign-in expired, the closing screen says so: sign in again in a new tab, then press *Try saving again* (nothing on screen is lost).

## After each sitting

- **Draft pathways** from the student's page, so the lab can see which sparks grew into pathways. Each draft shows which pathway and step each spark fed.
- **Until AI drafting is on for real students** (Fizzy card #22: Anthropic terms for student data, then `AI_REAL_STUDENTS=on`), drafts for pilot students are the canned template. Then the lab's *Used in pathways* and *Pathways shaped* rows say nothing about real students. Read the teen-reaction rows meanwhile, and use fictional sample sittings to exercise the drafting rows.

## Reading the results

Open **`/pilot` → Spark Lab** (admin and admissions only). It shows counts, never names, and keeps pilot students and fictional samples apart.

| Row | What it tells you |
|---|---|
| Felt like them, Head to head | What resonates with teens |
| Specific details | Names, places and numbers in their words, the raw material for a distinctive pathway |
| Used in pathways, Pathways shaped | Whether those words actually turned into pathways |
| Time taken | Whether a format is worth its minutes |

A format marked *too few to call yet* has fewer than 5 sessions; treat its numbers as noise. A format can win with teens and lose on pathways; that's worth knowing, not a tie to break by feel.

## When a winner is clear

Make it the default for in-person Spark and give at-home family links the same format (family links still run the original flow). Both are steps on Fizzy card #16. The starters and cards are plain text in `prompts/spark-starters.txt` and `prompts/spark-cards.txt`, so faculty can edit them without code.
