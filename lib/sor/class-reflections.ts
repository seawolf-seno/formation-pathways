// What a student says they enjoy about their classes, captured in the class
// reflections experience (/pathway/[personId]/classes). Courses alone say
// little (nearly every classmate takes the same ones); which classes THIS
// student enjoys, and what makes each one good for them, says a lot. Pure:
// which classes to ask about, validation, and the text handed to the drafting
// prompt. No I/O.
//
// Enjoyment only, by design: a class a student doesn't tap is simply not
// recorded. There is no "didn't like it", no rating and no number (product
// principles 2 and 6), and nothing here ranks one class against another.

/** One class a student can reflect on, from their imported schedule. */
export interface ReflectionClass {
  /** Source and id ("blackbaud:<section>", "canvas:<course>"), so a renamed course still matches. */
  key: string;
  title: string;
  schoolYear: string | null;
  offeringType: string | null;
}

export interface ClassReflection {
  key: string;
  title: string;
  schoolYear: string | null;
  /** Tapped twice: a class they love, not only like. */
  loved: boolean;
  /** What makes it good for them (prompts/class-reflection-likes.txt, or their own). */
  liked: string[];
  /** One thing about the class, in their own words. */
  note: string;
  via: "voice" | "text";
}

export interface ClassReflections {
  classes: ClassReflection[];
}

/** One saved sitting (a `class_reflections` row). */
export interface ClassReflectionSession {
  reflections: ClassReflections;
  created_at: string;
}

export const MAX_CLASSES = 20;
export const MAX_LIKED = 6;
export const MAX_NOTE_LENGTH = 600;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A title with its level prefix dropped, so Canvas's "Honors Physics" and
 *  Blackbaud's "Physics" count as the one class a student is taking. */
const sameClass = (title: string) => title.trim().toLowerCase().replace(/^(honors|ap|advanced|adv\.?)\s+/, "");

/** The classes to ask about: the most recent school year of Blackbaud class
 *  history, plus any Canvas course that isn't already there by title. Titles
 *  and offering type only; nothing about how the student is doing in them. */
export function classesForReflection(
  courses: { canvas_course_id: string; course_name: string }[],
  classHistory: { source: string; section_id: string; school_year: string; course_title: string; offering_type: string | null }[]
): ReflectionClass[] {
  const year = classHistory.reduce<string | null>((max, h) => (max === null || h.school_year > max ? h.school_year : max), null);
  const out: ReflectionClass[] = [];
  const titles = new Set<string>();
  const add = (c: ReflectionClass) => {
    const title = sameClass(c.title);
    if (!title || titles.has(title)) return;
    titles.add(title);
    out.push(c);
  };
  for (const h of classHistory) {
    if (h.school_year !== year) continue;
    add({ key: `${h.source}:${h.section_id}`, title: h.course_title, schoolYear: h.school_year, offeringType: h.offering_type });
  }
  for (const c of courses) {
    add({ key: `canvas:${c.canvas_course_id}`, title: c.course_name, schoolYear: year, offeringType: null });
  }
  return out.slice(0, MAX_CLASSES);
}

/** Clean, size-capped copy of what the browser sent, or an error. With
 *  `allowed` (the student's own classes, read on the server), a class that
 *  isn't theirs is dropped and the title and year come from the schedule,
 *  never from the browser. */
export function validateClassReflections(
  raw: unknown,
  allowed?: ReflectionClass[]
): { ok: true; reflections: ClassReflections } | { ok: false; error: string } {
  const list = (raw as { classes?: unknown } | null)?.classes;
  const known = allowed ? new Map(allowed.map((c) => [c.key, c])) : null;
  const seen = new Set<string>();
  const classes: ClassReflection[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const x = (item ?? {}) as Record<string, unknown>;
    const key = clip(x.key, 120);
    const match = known?.get(key);
    const title = match ? match.title : clip(x.title, 120);
    if (!key || !title || seen.has(key) || (known && !match)) continue;
    seen.add(key);
    classes.push({
      key,
      title,
      schoolYear: match ? match.schoolYear : clip(x.schoolYear, 20) || null,
      loved: Boolean(x.loved),
      liked: [...new Set((Array.isArray(x.liked) ? x.liked : []).map((l) => clip(l, 60)).filter(Boolean))].slice(0, MAX_LIKED),
      note: clip(x.note, MAX_NOTE_LENGTH),
      via: x.via === "voice" ? "voice" : "text",
    });
    if (classes.length === MAX_CLASSES) break;
  }
  if (!classes.length) return { ok: false, error: "Tap at least one class you enjoy." };
  return { ok: true, reflections: { classes } };
}

/** Every sitting as one list, newest first: a class keeps its most recent
 *  reflection, and a class only mentioned in an earlier sitting stays. */
export function latestReflections(sessions: ClassReflectionSession[]): ClassReflection[] {
  const byClass = new Map<string, ClassReflection>();
  for (const { reflections } of sessions) {
    for (const c of reflections.classes) if (!byClass.has(c.key)) byClass.set(c.key, c);
  }
  // Loved classes first; otherwise the order they were given in.
  return [...byClass.values()].sort((a, b) => Number(b.loved) - Number(a.loved)).slice(0, MAX_CLASSES);
}

/** The reflections as plain text for the drafting prompt (first-person evidence). */
export function reflectionsForPrompt(classes: ClassReflection[]): string {
  return classes
    .map((c) => {
      const parts = [`- ${c.loved ? "Loves" : "Enjoys"} ${c.title}${c.schoolYear ? ` (${c.schoolYear})` : ""}`];
      if (c.liked.length) parts.push(`what makes it good for them: ${c.liked.join(", ")}`);
      if (c.note) parts.push(`in their words: "${c.note}"`);
      return parts.join("; ");
    })
    .join("\n");
}
