# Testing the family inquiry flow on your phone

For the admissions team. About 25 minutes, on your own phone, with fictional families only. You play
three people: a parent who inquires, the admissions officer who answers, and a friend who sees
the shared pathway and inquires too. The goal is to feel how easy (or not) each step is from a phone.

**Nothing here reaches a real family or Finalsite.** While you're signed in, everything you send is
saved as a **Sample**.

## Before you start

- seno has applied `supabase/migrations/20261012000000_referral_thanks.sql` and deployed this
  version.
- Your staff account has the **admissions** role (seno sets it on `/pilot`).
- On your phone, open **https://formation-pathways.vercel.app/login**, enter your
  @pacificachristian.org email, and type the 6-digit code from the email. Or use **Continue with
  Google** if you see it.
- Pick an email you can check on this phone and that accepts "+" addresses. Your school Gmail
  works: `you+wren@pacificachristian.org` arrives in your own inbox.

Note how long each part takes. The questions are at the end.

## Part 1: You're a parent (5 min)

1. Open **https://formation-pathways.vercel.app/discover**. A gold **Test mode** note at the top
   means you're signed in, so this will be saved as a sample.
2. Fill it in as a parent would. Make up a child (say, Wren). In **One thing**, write something
   particular, like "She takes apart every radio she finds." That sentence is what the pathway
   grows from.
3. For your email use `you+wren@pacificachristian.org`. Use a made-up street address.
4. Tap **Send to Pacifica**.

**What you should see right away:** a welcome page built from what you wrote. It has your words
back, programs that match what you ticked, "A first week", and "What happens next". No AI is
involved; it appears instantly. It ends with **Where to go from here**: the pathway on its way,
**Send them the link** to invite another family, and **Start the application**. Links tagged
"Placeholder link" aren't final yet.

5. Tap **Open it in the inbox** (in the gold note).

## Part 2: You're admissions (5 min)

On Wren's page:

1. Tap **Draft a Formation Pathway**. A seawolf surfs while you wait, about a minute.
2. Two pathways come back. Read them. Untick any that doesn't sound like Wren, then tap **Sign**.
3. Under **Send it to the family**, tap **Make the family's link**, then **Email it to …**. Your
   mail app opens with the message written. Check it's addressed to your `+wren` address and send
   it. It goes from you, by name.

## Part 3: You're the parent again (5 min)

1. Open the email on your phone and tap the link. No sign-in needed: it's the family's own page.
2. Scroll down to **Share Wren's pathway**.
3. Tick **I'm Wren's parent or guardian…**. Nothing is public until you do.
4. Try the looks (Night tide, Paper, Morning sky) and the sizes (Post, Story).
5. Tap **Share**. Your phone's share sheet opens with the card image attached. Send it to yourself
   in Messages or email. Read the words that go with it, including the line that says Pacifica
   may send a thank-you. (Sample families always show that line. Real families only see it if
   leadership turns thank-yous on.)

## Part 4: You're a friend who saw the post (3 min)

1. Open the link you just sent yourself. That's what friends see: Wren's first name and one
   pathway, nothing else.
2. Tap **Tell us about your child**. The form opens already linked to Wren's family.
3. Inquire as a **different** family: another child's name, `you+friend@pacificachristian.org`,
   and a different street address. (The app won't credit a family for referring itself, so the
   same email or address is refused at the thank-you step.)

## Part 5: You're admissions again (5 min)

1. Go to **https://formation-pathways.vercel.app/pilot/inquiries**. On a phone the inbox shows one
   card per family. The friend's card says "Shared by the … family".
2. Tap **Referrals** (it shows "1 to confirm"), then **Confirm the referral**.
3. Pretend the friend applied: set their status to **applied**.
4. Tap **Approve the thank-you**, then **I've sent it**. Each step records your name.
5. Back on **Inquiries**, scroll to **How it's going**: counts only. Your test families are in the
   **Samples** column.

## Questions to answer

Send your answers to seno, along with the times you noted for each part.

1. **Parent:** Was the form quick on a phone? Was any question confusing or too personal?
2. **Welcome page:** Did it feel like it heard you? Is anything there we can't actually deliver?
3. **Next steps:** Is there always something to do next? What should **Start the application** and
   **Ask for a pathway** link to? Send seno the real links.
4. **"A first week":** These lines are placeholders. Please rewrite them in your own words with
   real first-week moments, three or four lines, one sentence each.
5. **Pathway:** Did it sound like the child you described, or like any child? Would you sign it?
6. **Sending:** Was "Email it to …" easy? Would you rather the app send the email itself?
7. **Sharing:** Would a parent post this card? Is the guardian checkbox clear? Is the thank-you
   line honest without being awkward?
8. **Referrals:** Were confirm → approve → sent clear? What should the thank-you actually be?
   (Leadership decides; your suggestion helps.)
9. Anything that felt slow, broken, or not like Pacifica.

## If something goes wrong

- **"Your sign-in has expired"**: sign in again in a new tab, come back, and tap the button again.
- **The draft takes over two minutes**: refresh. If the button is back, tap it again.
- **"A family can't refer itself"**: the friend used the same email or street address as the
  first family. Send another test inquiry with different ones.
- **The family link says it isn't working**: links last 60 days and only show signed pathways.
  Make a new one on the inquiry page.
