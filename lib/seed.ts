import type Database from "better-sqlite3";
import type { FormationTag } from "./types";

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
