import type Database from "better-sqlite3";
import { buildMockCanvasSyncResult } from "./integrations/canvas";
import { MOCK_DOCS } from "./integrations/drive";
import { fallbackSkillSnapshots } from "./claude";
import type {
  ApplicantAnswer,
  FormationTag,
  GeneratedPathwaysResult,
} from "./types";

interface SeedStudent {
  name: string;
  grade: number;
}

interface SeedObservation {
  studentIndex: number; // index into STUDENTS
  author: string;
  daysAgo: number;
  text: string;
  tags: FormationTag[];
}

const STUDENTS: SeedStudent[] = [
  { name: "Maya Chen", grade: 9 },
  { name: "Jordan Ellis", grade: 9 },
  { name: "Priya Patel", grade: 10 },
  { name: "Devon Brooks", grade: 10 },
  { name: "Sofia Reyes", grade: 10 },
  { name: "Malik Thompson", grade: 11 },
  { name: "Ava Nakamura", grade: 11 },
  { name: "Ethan Walker", grade: 11 },
  { name: "Grace Osei", grade: 12 },
  { name: "Lucas Ferreira", grade: 12 },
  { name: "Noor Hassan", grade: 12 },
  { name: "Ben Whitfield", grade: 9 }, // deliberately under-observed
];

// studentIndex refers to position in STUDENTS above.
const OBSERVATIONS: SeedObservation[] = [
  // Maya Chen (0)
  {
    studentIndex: 0,
    author: "Ms. Alvarez",
    daysAgo: 2,
    text: "Maya turned in a personal essay draft that named a fear she's never said out loud in class — being 'the quiet one' people underestimate. She asked if she could read part of it aloud tomorrow. That's new.",
    tags: ["Intellectual Courage", "Emerging Superpowers"],
  },
  {
    studentIndex: 0,
    author: "Dr. Okafor",
    daysAgo: 18,
    text: "Stayed after chapel to ask why the psalm we read sounded so angry at God. Wanted to know if that was 'allowed.' We talked for fifteen minutes. She's wrestling with something real.",
    tags: ["Spiritual Depth"],
  },
  {
    studentIndex: 0,
    author: "Mr. Kim",
    daysAgo: 50,
    text: "Maya walked a struggling classmate through the whole quiz correction without being asked, quietly, so no one would notice. I noticed.",
    tags: ["Love of Neighbor", "Character Under Pressure"],
  },
  // Jordan Ellis (1)
  {
    studentIndex: 1,
    author: "Coach Diaz",
    daysAgo: 5,
    text: "Jordan got subbed out in the third quarter of a close scrimmage and instead of sulking, spent the whole bench time coaching the freshman who replaced him. First time I've seen him lead instead of perform.",
    tags: ["Character Under Pressure", "Emerging Superpowers"],
  },
  {
    studentIndex: 1,
    author: "Mrs. Novak",
    daysAgo: 40,
    text: "Jordan's the loudest voice in the room until the topic turns serious — today we discussed the Civil Rights Movement and he asked, dead serious, 'were there kids our age doing this?' Then went quiet for the rest of class.",
    tags: ["Intellectual Courage"],
  },
  // Priya Patel (2)
  {
    studentIndex: 2,
    author: "Mr. Sato",
    daysAgo: 1,
    text: "Priya's hypothesis was wrong and she said so out loud before I could even ask — 'my prediction was bad, here's why' — and reworked it on the spot. Huge growth from September.",
    tags: ["Intellectual Courage"],
  },
  {
    studentIndex: 2,
    author: "Ms. Grant",
    daysAgo: 10,
    text: "She scrapped a piece she'd spent three weeks on because it 'wasn't honest' and started over with two days left. Braver choice than finishing the safe version.",
    tags: ["Intellectual Courage", "Emerging Superpowers"],
  },
  {
    studentIndex: 2,
    author: "Ms. Patterson",
    daysAgo: 30,
    text: "Came in worried she was 'too intense' for her friend group. We talked about the difference between intensity and care. She left lighter.",
    tags: ["Character Under Pressure"],
  },
  // Devon Brooks (3)
  {
    studentIndex: 3,
    author: "Coach Diaz",
    daysAgo: 8,
    text: "Devon organized the underclassmen to carry equipment for an injured teammate all week without being asked. Nobody assigns that. He just does it.",
    tags: ["Love of Neighbor"],
  },
  {
    studentIndex: 3,
    author: "Mr. Lindqvist",
    daysAgo: 25,
    text: "Asked a genuinely hard question about whether God 'still likes you' after you mess up a lot. I don't think it was hypothetical.",
    tags: ["Spiritual Depth"],
  },
  // Sofia Reyes (4)
  {
    studentIndex: 4,
    author: "Ms. Alvarez",
    daysAgo: 3,
    text: "Sofia disagreed with the popular reading of the poem in front of the whole class and held her ground when two people pushed back. She used to fold immediately.",
    tags: ["Intellectual Courage", "Character Under Pressure"],
  },
  {
    studentIndex: 4,
    author: "Mrs. Novak",
    daysAgo: 12,
    text: "She noticed a classmate sitting alone at the group-project table and rearranged her own group to include him without making it a thing.",
    tags: ["Love of Neighbor"],
  },
  {
    studentIndex: 4,
    author: "Ms. Patterson",
    daysAgo: 45,
    text: "Sofia said she's been 'the peacemaker' her whole life and is tired of it. We talked about what honesty costs and whether it's worth it. She thinks it is.",
    tags: ["Character Under Pressure"],
  },
  // Malik Thompson (5)
  {
    studentIndex: 5,
    author: "Mr. Kim",
    daysAgo: 6,
    text: "Malik ran the review session for the whole class unprompted because 'people needed it before the test.' Didn't ask for credit.",
    tags: ["Emerging Superpowers", "Love of Neighbor"],
  },
  {
    studentIndex: 5,
    author: "Dr. Okafor",
    daysAgo: 18,
    text: "Malik told me privately he feels like everyone expects him to have his future decided already, and he doesn't. Asked if that was okay. It is, and I told him so.",
    tags: ["Spiritual Depth", "Sense of Calling"],
  },
  {
    studentIndex: 5,
    author: "Coach Diaz",
    daysAgo: 33,
    text: "Team lost badly. Malik was the one checking on younger teammates after, not sulking about the score.",
    tags: ["Character Under Pressure"],
  },
  // Ava Nakamura (6)
  {
    studentIndex: 6,
    author: "Ms. Alvarez",
    daysAgo: 4,
    text: "Ava's essay on 'calling' argued she doesn't believe in it — then spent three pages describing exactly what she wants her life to be about. She doesn't see the contradiction yet. I might point it out gently.",
    tags: ["Sense of Calling", "Intellectual Courage"],
  },
  {
    studentIndex: 6,
    author: "Mr. Lindqvist",
    daysAgo: 22,
    text: "Pushed back hard on a reading, said it felt like 'spiritual bypassing.' Sharp critique, actually correct. Wants a faith that holds up to scrutiny, not less scrutiny.",
    tags: ["Spiritual Depth", "Intellectual Courage"],
  },
  // Ethan Walker (7)
  {
    studentIndex: 7,
    author: "Mr. Sato",
    daysAgo: 9,
    text: "Ethan built a working sensor rig for the physics project that was way beyond the assignment. Didn't mention it until I found it running in the back of the room.",
    tags: ["Emerging Superpowers"],
  },
  {
    studentIndex: 7,
    author: "Ms. Grant",
    daysAgo: 27,
    text: "He's usually silent in critique circle. Today he gave another student feedback so specific and kind it visibly changed how she saw her own work.",
    tags: ["Love of Neighbor", "Emerging Superpowers"],
  },
  {
    studentIndex: 7,
    author: "Ms. Patterson",
    daysAgo: 50,
    text: "Ethan opened up about feeling invisible next to louder classmates. First time he's said it out loud instead of just disappearing into headphones.",
    tags: ["Character Under Pressure"],
  },
  // Grace Osei (8)
  {
    studentIndex: 8,
    author: "Dr. Okafor",
    daysAgo: 2,
    text: "Grace led the chapel reflection today and named, in front of everyone, that senior year isn't the triumphant lap people promised her. Braver than any polished talk would've been.",
    tags: ["Intellectual Courage", "Character Under Pressure"],
  },
  {
    studentIndex: 8,
    author: "Mr. Kim",
    daysAgo: 14,
    text: "She's been quietly tutoring a sophomore three lunches a week. I only found out because he mentioned it, not her.",
    tags: ["Love of Neighbor", "Emerging Superpowers"],
  },
  // Lucas Ferreira (9)
  {
    studentIndex: 9,
    author: "Mrs. Novak",
    daysAgo: 11,
    text: "Lucas usually does the minimum. Today he came in with an actual counter-argument to my lecture, sources and all. First time all year he's fought for an idea instead of just getting the grade.",
    tags: ["Intellectual Courage", "Emerging Superpowers"],
  },
  {
    studentIndex: 9,
    author: "Mr. Lindqvist",
    daysAgo: 29,
    text: "Asked what happens if he graduates and still doesn't know what he's 'supposed to do with his life.' Told him that's most people, including me at his age.",
    tags: ["Sense of Calling"],
  },
  // Noor Hassan (10)
  {
    studentIndex: 10,
    author: "Ms. Alvarez",
    daysAgo: 7,
    text: "Noor's college essay draft is about the year she stopped performing certainty about her faith and started actually asking questions. It's the most honest writing I've seen from her.",
    tags: ["Spiritual Depth", "Intellectual Courage"],
  },
  {
    studentIndex: 10,
    author: "Coach Diaz",
    daysAgo: 19,
    text: "She's the one who checks on teammates after a tough loss, freshmen and seniors alike. Doesn't matter who.",
    tags: ["Love of Neighbor"],
  },
  {
    studentIndex: 10,
    author: "Ms. Patterson",
    daysAgo: 60,
    text: "Noor talked about the pressure of being 'the responsible one' in every group she's in. Wants permission to not have it together sometimes.",
    tags: ["Character Under Pressure"],
  },
  // Ben Whitfield (11) — deliberately under-observed: both older than 60 days
  {
    studentIndex: 11,
    author: "Mr. Kim",
    daysAgo: 95,
    text: "Ben answered a question correctly that I don't think anyone expected him to raise his hand for. Quick, unprompted, and right.",
    tags: ["Emerging Superpowers"],
  },
  {
    studentIndex: 11,
    author: "Ms. Alvarez",
    daysAgo: 150,
    text: "Ben turned in a solid first essay. Quiet in class but the writing has a real voice underneath it.",
    tags: ["Intellectual Courage"],
  },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // Spread across a plausible school-day hour so timestamps aren't identical.
  d.setHours(9 + (days % 7), 15, 0, 0);
  return d.toISOString();
}

export function seedIfEmpty(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM students").get() as {
    count: number;
  };
  if (row.count > 0) return;

  const insertStudent = db.prepare(
    "INSERT INTO students (name, grade, created_at) VALUES (?, ?, ?)"
  );
  const insertObservation = db.prepare(
    `INSERT INTO observations (student_id, author, raw_text, clean_text, tags, discipline_flag, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  );

  const seedTx = db.transaction(() => {
    const studentIds: number[] = STUDENTS.map((s) => {
      // Students are "created" well before any observation about them.
      const info = insertStudent.run(s.name, s.grade, isoDaysAgo(200));
      return info.lastInsertRowid as number;
    });

    for (const obs of OBSERVATIONS) {
      const studentId = studentIds[obs.studentIndex];
      const createdAt = isoDaysAgo(obs.daysAgo);
      insertObservation.run(
        studentId,
        obs.author,
        obs.text,
        obs.text,
        JSON.stringify(obs.tags),
        createdAt
      );
    }
  });

  seedTx();
}

interface SeedApplicant {
  name: string;
  grade: number;
  slug: string;
  token: string;
  status: "submitted" | "approved";
  answers: ApplicantAnswer[];
  generated: GeneratedPathwaysResult;
}

const APPLICANTS: SeedApplicant[] = [
  {
    name: "Emma Reyes",
    grade: 9,
    slug: "emma-r",
    token: "8f3k2a",
    status: "approved",
    answers: [
      {
        question:
          "Tell us about a time you lost track of time doing something. What were you doing, and what pulled you in?",
        answer:
          "I was rebuilding my little brother's broken RC car with parts from three other broken toys. I looked up and it was dark outside — I'd missed dinner. I just wanted to see if it would actually drive again.",
      },
      {
        question:
          "Who is someone you admire — famous or not — and what is it about the way they live that you want for your own life?",
        answer:
          "My abuela. She fixes everything in her house herself instead of paying someone, and she taught me it's not about money, it's about not being afraid to open something up and figure out how it works.",
      },
      {
        question:
          "Tell us about something hard you've faced. What did it teach you about who you are?",
        answer:
          "Moving schools in 7th grade and being the only new kid. I learned I'd rather sit with the one lonely person at lunch than try to impress the popular table — I noticed I actually looked for kids sitting alone after that.",
      },
      {
        question:
          "If you could spend a whole year getting really good at one thing, what would you choose, and why that?",
        answer:
          "Building actual robots, not just toy ones. I want to build something that helps my abuela around the house since her knees hurt now.",
      },
      {
        question:
          "When you imagine yourself at high school graduation, what do you hope is true about you that isn't true yet?",
        answer:
          "That I stopped being afraid to show people something I built before it's finished and perfect.",
      },
    ],
    generated: {
      pathways: [
        {
          name: "The Fixer",
          firstSemester:
            'Emma starts in STEM Scholars, where "not being afraid to open something up and figure out how it works" becomes her actual Makers Space project instead of a rainy-day hobby.',
          mentorArchetype:
            "Dr. David Sumida (Engineering) — teaches in the STEM Scholars program, home to the Makers Space where students build and iterate on their own projects.",
          stretchChallenge:
            "Presenting an unfinished robotics build to a room of people — practicing the exact thing she said she wants to stop being afraid of: \"showing people something I built before it's finished.\"",
          fourYearHorizon: [
            "an engineering-focused university research track",
            "a summer apprenticeship with a robotics or hardware startup",
          ],
          milestones: [
            { when: "Freshman fall", title: "Open something up", detail: "Join STEM Scholars and claim a bench in the Makers Space, where taking things apart is the assignment." },
            { when: "Sophomore year", title: "Fly what you build", detail: "Build and rebuild with the Drone Club as it gets ready for the Aerial Drone Competition." },
            { when: "Junior year", title: "Show it before it's finished", detail: "Bring a half-built robot to the i.Sight Festival and talk people through what isn't working yet." },
            { when: "Senior year", title: "Hand off what you've learned", detail: "Lead a Makers Space project with younger students, then choose the road that fits what you've built." },
          ],
          glimpse:
            "Picture a Thursday in the spring of your junior year. It's after school in the Makers Space, the drone's left motor is still stuttering, and two freshmen are watching you take it apart again, because you're the one who isn't afraid to open it up.",
        },
        {
          name: "Abuela's Engineer",
          firstSemester:
            "Her Makers Space project starts as something practical: a low-cost assistive device idea for her abuela's knees, workshopped with real tools from day one.",
          mentorArchetype:
            "Steven Eno (Mathematics) — the math faculty behind the problem-solving that a real assistive-device build actually requires, from STEM Scholars.",
          stretchChallenge:
            "Turning a family need into a project other students could actually use — moving from 'fixed it for one person' to 'built something that scales.'",
          fourYearHorizon: [
            "a service-academy or vocational engineering track",
            "a selective university with a strong applied-engineering program",
          ],
          milestones: [
            { when: "Freshman fall", title: "Start with one real need", detail: "Sketch an assistive-device idea for your abuela's knees in the Makers Space, with real tools from day one." },
            { when: "Sophomore year", title: "Do the math it takes", detail: "Use the problem-solving from your STEM Scholars math courses to make a prototype that actually holds weight." },
            { when: "Junior year", title: "Build for more than one person", detail: "Test the design with Women in STEM's service projects, so it helps people beyond your own family." },
            { when: "Senior year", title: "Share the plans", detail: "Present your 100 hours of STEM work to the community and choose where to keep building." },
          ],
          glimpse:
            "Picture a Saturday morning at your abuela's kitchen table. She's testing the third version of the thing you built for her knees, and this time she doesn't hand it back. She asks if you can make two more for her friends.",
        },
        {
          name: "The One Who Sits Down",
          firstSemester:
            'The All-School Retreat comes first, small-group and unhurried, where the instinct she named, looking "for kids sitting alone," gets to be who she is rather than a story she tells in an essay.',
          mentorArchetype:
            "Trevor DeBenning (Chapel Director) — runs weekly chapel and the All-School Retreat, where noticing who's on the outside of a group is the whole point.",
          stretchChallenge:
            "Leading a small-group mentoring role for a newer student, the way she wished someone had for her in 7th grade.",
          fourYearHorizon: [
            "a selective college with strong community-engagement programs",
            "a gap-year fellowship focused on mentorship or service",
          ],
          milestones: [
            { when: "Freshman fall", title: "Notice who's on the edge", detail: "Go on the All-School Retreat, where small groups talk honestly about real life and faith." },
            { when: "Sophomore year", title: "Make room at the table", detail: "Bring the habit you already have, sitting with the one who's alone, into weekly chapel and your small group." },
            { when: "Junior year", title: "Lead a small group", detail: "Mentor a newer student the way you wished someone had for you in 7th grade." },
            { when: "Senior year", title: "Pass it on", detail: "Help shape the retreat for the class behind you, then choose a road built around people." },
          ],
          glimpse:
            "Picture the second night of the All-School Retreat. The fire is low, your small group has gone quiet, and you're the one who scoots over so the new kid has somewhere to sit. Nobody else noticed. You did.",
        },
      ],
      seedObservations: [
        {
          text: 'In her application, Emma wrote about rebuilding her little brother\'s RC car from parts of three broken toys, losing track of time until "it was dark outside." Worth pairing her with STEM Scholars early.',
          tags: ["Emerging Superpowers"],
        },
        {
          text: "She wrote about looking for the one lonely kid at a new lunch table instead of trying to impress the popular one — a pattern worth watching for in her first weeks.",
          tags: ["Love of Neighbor", "Character Under Pressure"],
        },
        {
          text: 'She named wanting to stop being "afraid to show people something I built before it\'s finished" — a good, gentle thing to invite her into early, not force.',
          tags: ["Intellectual Courage"],
        },
      ],
    },
  },
  {
    name: "Marcus Bell",
    grade: 10,
    slug: "marcus-b",
    token: "q7d1n9",
    status: "submitted",
    answers: [
      {
        question:
          "Tell us about a time you lost track of time doing something. What were you doing, and what pulled you in?",
        answer:
          "Reading about the early Church fathers for a debate I wasn't even assigned. I wanted to know if what my youth pastor said last week actually held up historically.",
      },
      {
        question:
          "Who is someone you admire — famous or not — and what is it about the way they live that you want for your own life?",
        answer:
          "My debate coach. She'll argue the side she personally disagrees with just as hard, because she says you don't actually understand your own position until you've defended the other one.",
      },
      {
        question:
          "Tell us about something hard you've faced. What did it teach you about who you are?",
        answer:
          "I doubted my faith pretty seriously last year and was scared to tell anyone at my old church. I learned that asking the question out loud didn't destroy anything — it's actually what got me somewhere real.",
      },
      {
        question:
          "If you could spend a whole year getting really good at one thing, what would you choose, and why that?",
        answer:
          "Formal debate and rhetoric — I want to be able to actually defend what I believe under real pressure, not just at church camp.",
      },
      {
        question:
          "When you imagine yourself at high school graduation, what do you hope is true about you that isn't true yet?",
        answer:
          "That I can sit across from someone who thinks I'm wrong about God and not get defensive.",
      },
      ],
    generated: {
      pathways: [
        {
          name: "The Honest Apologist",
          firstSemester:
            'Marcus starts in an Oxford-style seminar in the Center for Philosophy & Theology, where "asking the question out loud" is the assignment, not the risk — his first seminar topic is the one he was scared to raise at his old church.',
          mentorArchetype:
            "Devin Ketch (Philosophy/Theology/Psychology) — teaches in the Center for Philosophy & Theology, where seminars are built around Old and New Testament, moral and ancient philosophy, and defending an idea all the way through.",
          stretchChallenge:
            "Debating a position he actually holds, in front of people who disagree, and staying in the room afterward — practicing exactly what he said isn't true of him yet.",
          fourYearHorizon: [
            "a selective college with a strong debate or rhetoric program",
            "a ministry-track apprenticeship under a working pastor",
          ],
          milestones: [
            { when: "Sophomore fall", title: "Ask it out loud", detail: "Bring the question you were scared to raise into an Oxford-style seminar in the Center for Philosophy & Theology." },
            { when: "Sophomore spring", title: "Go to the sources", detail: "Read the early Church fathers for real in Patristic Theology, not just for a debate." },
            { when: "Junior year", title: "Stay in the room", detail: "Defend a position you hold in front of people who disagree, then keep talking afterward." },
            { when: "Senior year", title: "Teach the conversation", detail: "Help younger students practice Intellectual Hospitality, then choose where to keep asking." },
          ],
          glimpse:
            "Picture a Tuesday seminar in the spring of your junior year. Six chairs, one table, and a classmate who thinks you're wrong about something that matters. You lean in instead of out, because you've learned that asking out loud is where it gets real.",
        },
        {
          name: "Steelman",
          firstSemester:
            "Following the rule he admires in his coach, his first seminar assignment is arguing a side he personally disagrees with — turning 'you don't understand your own position until you've defended the other one' into his actual curriculum.",
          mentorArchetype:
            "Dr. Katheryn Park (English) — English faculty whose coursework in argument and rhetoric gives him the tools to build and take apart a case on paper, not just out loud.",
          stretchChallenge:
            "Writing and delivering the strongest possible case against his own current belief, then answering it honestly.",
          fourYearHorizon: [
            "a research track in philosophy, theology, or rhetoric at a selective university",
            "a fellowship or program built around public discourse and civic debate",
          ],
          milestones: [
            { when: "Sophomore fall", title: "Argue the other side", detail: "Take a position you disagree with in your first seminar and build it as strongly as you can." },
            { when: "Sophomore spring", title: "Put it on paper", detail: "Learn to build and take apart an argument in writing through your English coursework." },
            { when: "Junior year", title: "Answer your own best critic", detail: "Write the strongest case against what you believe, then answer it honestly in Moral Philosophy." },
            { when: "Senior year", title: "Take it public", detail: "Make the case in front of the Insight Speaker Series audience, then choose where to keep arguing well." },
          ],
          glimpse:
            "Picture finishing a paper at the kitchen table that argues against your own view, and realizing it's the best thing you've written. Tomorrow you'll answer it, and you'll understand your own position better than you ever have.",
        },
        {
          name: "Unshaken, Not Unquestioned",
          firstSemester:
            "The All-School Retreat becomes the place where he first says out loud to peers what he only admitted alone last year — that doubt is where his year of growth actually started.",
          mentorArchetype:
            "Linnea Scobey (Latin/Theology) — theology faculty in a program built on \"Intellectual Hospitality,\" treating a hard question about faith as worth sitting with, not managing away.",
          stretchChallenge:
            "Sitting across from a classmate who disagrees with him about God, on purpose, and staying curious instead of defensive.",
          fourYearHorizon: [
            "a vocational-ministry track",
            "a selective college with a strong philosophy or religious-studies department",
          ],
          milestones: [
            { when: "Sophomore fall", title: "Say it to peers", detail: "Share what you only admitted alone last year, in your small group at the All-School Retreat." },
            { when: "Sophomore spring", title: "Sit with the hard question", detail: "Work through it in theology courses built on Intellectual Hospitality, where doubt is worth staying with." },
            { when: "Junior year", title: "Disagree on purpose", detail: "Seek out a classmate who sees God differently and stay curious instead of defensive." },
            { when: "Senior year", title: "Be the safe person", detail: "Be someone a younger student can bring their doubt to in chapel and small groups, then choose your road." },
          ],
          glimpse:
            "Picture walking out of chapel next to the classmate you argued with all semester. You still don't agree. You're both laughing anyway, and you realize the faith you were afraid would break has only grown roots.",
        },
      ],
      seedObservations: [
        {
          text: 'He wrote about reading early Church history for a debate "I wasn\'t even assigned," to check whether something he\'d been taught actually held up. Sharp, self-directed curiosity worth naming early.',
          tags: ["Intellectual Courage", "Spiritual Depth"],
        },
        {
          text: 'He described doubting his faith seriously and being "scared to tell anyone" at his old church, then finding that saying it out loud "is actually what got me somewhere real."',
          tags: ["Spiritual Depth", "Character Under Pressure"],
        },
        {
          text: "He named wanting to sit across from someone who thinks he's wrong about God without getting defensive — worth a gentle check-in once he's in an actual debate room.",
          tags: ["Character Under Pressure"],
        },
      ],
    },
  },
];

export function seedApplicantsIfEmpty(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM applicants").get() as {
    count: number;
  };
  if (row.count > 0) return;

  const insert = db.prepare(
    `INSERT INTO applicants (name, grade, slug, token, answers, generated_pathways, status, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const seedTx = db.transaction(() => {
    for (const applicant of APPLICANTS) {
      insert.run(
        applicant.name,
        applicant.grade,
        applicant.slug,
        applicant.token,
        JSON.stringify(applicant.answers),
        JSON.stringify(applicant.generated),
        applicant.status,
        applicant.status === "approved" ? "Ms. Alvarez" : null,
        applicant.status === "approved" ? new Date().toISOString() : null
      );
    }
  });

  seedTx();
}

interface SeedClass {
  name: string;
  memberNames: string[];
}

// Deliberately overlapping rosters so the class switcher demonstrates a
// student showing up in more than one class.
const CLASSES: SeedClass[] = [
  {
    name: "Period 2 English",
    memberNames: [
      "Maya Chen",
      "Jordan Ellis",
      "Priya Patel",
      "Devon Brooks",
      "Ben Whitfield",
    ],
  },
  {
    name: "Advisory",
    memberNames: [
      "Maya Chen",
      "Sofia Reyes",
      "Malik Thompson",
      "Ava Nakamura",
      "Ethan Walker",
    ],
  },
  {
    name: "AP Literature",
    memberNames: [
      "Grace Osei",
      "Lucas Ferreira",
      "Noor Hassan",
      "Ava Nakamura",
    ],
  },
];

export function seedClassesIfEmpty(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM classes").get() as {
    count: number;
  };
  if (row.count > 0) return;

  const insertClass = db.prepare("INSERT INTO classes (name) VALUES (?)");
  const findStudentByName = db.prepare(
    "SELECT id FROM students WHERE name = ?"
  );
  const enroll = db.prepare(
    "INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)"
  );

  const seedTx = db.transaction(() => {
    for (const cls of CLASSES) {
      const info = insertClass.run(cls.name);
      const classId = info.lastInsertRowid as number;
      for (const name of cls.memberNames) {
        const student = findStudentByName.get(name) as
          | { id: number }
          | undefined;
        if (student) enroll.run(classId, student.id);
      }
    }
  });

  seedTx();
}

interface SeedCourse {
  name: string;
  teacherName: string;
  memberNames: string[];
  skills: { name: string; description: string }[];
  driveDocId: string;
}

const COURSES: SeedCourse[] = [
  {
    name: "Honors Physics",
    teacherName: "Mr. Sato",
    memberNames: [
      "Devon Brooks",
      "Sofia Reyes",
      "Malik Thompson",
      "Ethan Walker",
      "Ben Whitfield",
    ],
    skills: [
      { name: "Hypothesis & Reasoning", description: "States a falsifiable hypothesis and explains the physical reasoning behind it before collecting data." },
      { name: "Experimental Design", description: "Controls variables deliberately and can explain why each control matters." },
      { name: "Data & Error Analysis", description: "Reports uncertainty honestly, including sources of error, rather than hiding a messy result." },
      { name: "Revision Under Feedback", description: "States plainly when a hypothesis turns out wrong and re-derives rather than quietly moving on." },
      { name: "Collaboration", description: "Helps a lab partner debug their setup or reasoning without just handing over the answer." },
      { name: "Mathematical Modeling", description: "Translates a physical situation into the right equation, not just plugging numbers into a formula." },
    ],
    driveDocId: "mock-physics-rubric",
  },
  {
    name: "American Literature",
    teacherName: "Ms. Alvarez",
    memberNames: [
      "Maya Chen",
      "Jordan Ellis",
      "Priya Patel",
      "Grace Osei",
      "Lucas Ferreira",
      "Noor Hassan",
    ],
    skills: [
      { name: "Close Reading", description: "Notices something in the text a first read would miss, and can point to the exact line that shows it." },
      { name: "Argument Under Pressure", description: "When another student pushes back in discussion, sharpens the claim instead of abandoning it." },
      { name: "Voice", description: "Essays sound like a specific person thinking, not a five-paragraph template." },
      { name: "Historical Context", description: "Connects a text to the moment it was written without flattening the text into only that moment." },
      { name: "Generosity as a Reader", description: "In peer review, finds the strongest version of a classmate's argument before critiquing it." },
      { name: "Revision", description: "A second draft is a genuinely different, stronger piece of thinking, not a light polish of the first." },
    ],
    driveDocId: "mock-lit-notes",
  },
];

export function seedCoursesIfEmpty(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM courses").get() as {
    count: number;
  };
  if (row.count > 0) return;

  const insertCourse = db.prepare(
    "INSERT INTO courses (name, teacher_name, drive_doc_name, drive_doc_content, last_synced_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  const insertSkill = db.prepare(
    "INSERT INTO course_skills (course_id, name, description) VALUES (?, ?, ?)"
  );
  const findStudentByName = db.prepare("SELECT id, name FROM students WHERE name = ?");
  const enroll = db.prepare(
    "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)"
  );
  const insertSnapshot = db.prepare(
    `INSERT INTO skill_snapshots (student_id, skill_id, narrative, evidence, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );

  const seedTx = db.transaction(() => {
    for (const course of COURSES) {
      const doc = MOCK_DOCS.find((d) => d.id === course.driveDocId);
      const info = insertCourse.run(
        course.name,
        course.teacherName,
        doc?.name ?? null,
        doc?.content ?? null
      );
      const courseId = info.lastInsertRowid as number;

      const skillIds: number[] = course.skills.map((skill) => {
        const skillInfo = insertSkill.run(courseId, skill.name, skill.description);
        return skillInfo.lastInsertRowid as number;
      });

      const roster: { id: number; name: string }[] = [];
      for (const name of course.memberNames) {
        const student = findStudentByName.get(name) as
          | { id: number; name: string }
          | undefined;
        if (student) {
          enroll.run(courseId, student.id);
          roster.push(student);
        }
      }

      const canvasData = buildMockCanvasSyncResult(
        course.name,
        roster.map((s) => s.name)
      );
      const courseSkills = course.skills.map((s, i) => ({
        id: skillIds[i],
        course_id: courseId,
        name: s.name,
        description: s.description,
        created_at: "",
      }));
      const drafts = fallbackSkillSnapshots(courseSkills, canvasData);

      const skillIdByName = new Map(courseSkills.map((s) => [s.name, s.id]));
      const studentIdByName = new Map(roster.map((s) => [s.name, s.id]));
      for (const draft of drafts) {
        const studentId = studentIdByName.get(draft.studentName);
        const skillId = skillIdByName.get(draft.skillName);
        if (!studentId || !skillId) continue;
        insertSnapshot.run(
          studentId,
          skillId,
          draft.narrative,
          JSON.stringify(draft.evidence)
        );
      }
    }
  });

  seedTx();
}

// ---- Inquiry-stage demo ----------------------------------------------------
// All fictional. Real stories go in only with recorded consent
// (consent_confirmed); these carry is_fictional = 1 and the UI labels them.
type SeedAlumni = [school: string, first: string, year: number, headline: string, story: string, path: string, now: string];

const ALUMNI: SeedAlumni[] = [
  ["paul-revere", "Jordan", 2024, "Started in Makers Space, ended up leading it.",
   "Jordan arrived from Paul Revere unsure about high school. A freshman visit to the Makers Space turned into a student-led build that ran all four years.",
   "The Builder Who Leads", "Studying mechanical engineering, and still mentoring Makers Space freshmen."],
  ["paul-revere", "Camila", 2023, "Found her voice in a Moral Philosophy seminar.",
   "Camila was quiet at Paul Revere. Small Oxford-style seminars at the Center for Philosophy & Theology gave her room to think out loud, and she never stopped.",
   "The Thoughtful Voice", "Pursuing philosophy and pre-law, and leading a debate club."],
  ["paul-revere", "Malik", 2025, "Ran a real business before he could drive.",
   "Malik joined the Wolf Shack in ninth grade and learned inventory, pricing and profit by doing them. By senior year he was pitching in the Shark-Tank-style Entrepreneurship class.",
   "The Young Entrepreneur", "Starting at a business program, with a side project already selling."],
  ["calvary-christian", "Elena", 2024, "Traded the stage lights for a film camera.",
   "Elena came from Calvary Christian loving theater. PACARTS let her try film too, and her short screened at the Student Film Festival.",
   "The Storyteller", "Studying film, and shooting her first short for a local nonprofit."],
  ["calvary-christian", "Noah", 2023, "A baseball player who found a second calling.",
   "Noah played baseball from his first week and joined Drone Club in tenth grade. Both stayed with him: athletics for the team, engineering for the curiosity.",
   "The Athlete and the Tinkerer", "Playing college baseball while studying engineering."],
  ["all", "Priya", 2024, "Came for the classes, stayed for the retreat.",
   "Priya arrived not knowing anyone. The All-School Retreat and weekly chapel helped her find her people, and she now helps run new-student welcome.",
   "The Welcomer", "In college, leading a campus ministry team."],
  ["all", "Theo", 2025, "Discovered he loved the science behind the art.",
   "Theo split his time between Visual Arts and STEM Scholars, then found a way to combine them in a senior project on materials.",
   "The Artist-Engineer", "Studying materials science and design."],
];

export function seedInquiryDemoIfEmpty(db: Database.Database): void {
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
  if (n("alumni_stories") === 0) {
    const ins = db.prepare(
      `INSERT INTO alumni_stories (school_key, first_name, grad_year, headline, story, pathway_name, where_now, is_fictional, consent_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`
    );
    db.transaction(() => {
      for (const [k, f, y, h, s, p, w] of ALUMNI) ins.run(k, f, y, h, s, p, w);
    })();
  }
  if (n("inquiries") === 0) {
    const ins = db.prepare(
      "INSERT INTO inquiries (first_name, email, prior_school, interests) VALUES (?, ?, ?, ?)"
    );
    db.transaction(() => {
      ins.run("Sofia", "sofia.demo@example.com", "Paul Revere Middle School", "building things");
      ins.run("Marcus", "marcus.demo@example.com", "Calvary Christian School", null);
      ins.run("Ava", "ava.demo@example.com", "Lincoln Middle School", "music");
    })();
  }
}
