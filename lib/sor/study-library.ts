// The shared study library (fixtures/study-library.json): free, public study
// links by subject, shown beside a student's own classes on their Study Hub
// (/pathway/[personId]/study). Links only; nothing is mirrored or stored, and
// nothing here is about any student. Pure: reading the file's shape and
// matching a class title to its subject. No I/O.

export const RESOURCE_KINDS = ["Past exam", "Practice", "Open reading", "Reference"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** How each kind is headed on the page. */
export const KIND_HEADINGS: Record<ResourceKind, string> = {
  "Past exam": "Past exams",
  Practice: "Practice",
  "Open reading": "Free textbooks and readings",
  Reference: "Reference",
};

export interface StudyResource {
  title: string;
  url: string;
  kind: ResourceKind;
  /** Who publishes it. */
  source: string;
  /** What you may do with it, in the publisher's terms. */
  rights: string | null;
  /** A unit or topic it belongs to within the subject, if any. */
  group: string | null;
  /** Shown only for classes whose title contains one of these phrases. */
  courses: string[] | null;
}

export interface StudySubject {
  id: string;
  name: string;
  /** Lowercase phrases; a class whose title contains one belongs to this subject. */
  match: string[];
  resources: StudyResource[];
}

export interface StudyLibrary {
  subjects: StudySubject[];
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const phrases = (v: unknown) => (Array.isArray(v) ? v.map((p) => text(p, 80).toLowerCase()).filter(Boolean) : []);

/** Only ordinary https links: the file is hand-edited, and a link in it is
 *  rendered as something a student taps. */
function httpsUrl(v: unknown): string | null {
  try {
    const url = new URL(text(v, 500));
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The library file as typed data. Anything malformed is dropped, not guessed at. */
export function parseStudyLibrary(raw: unknown): StudyLibrary {
  const list = (raw as { subjects?: unknown } | null)?.subjects;
  const subjects: StudySubject[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const s = (item ?? {}) as Record<string, unknown>;
    const id = text(s.id, 40);
    const name = text(s.name, 80);
    const match = phrases(s.match);
    if (!id || !name || !match.length || subjects.some((x) => x.id === id)) continue;
    const resources: StudyResource[] = [];
    for (const entry of Array.isArray(s.resources) ? s.resources : []) {
      const r = (entry ?? {}) as Record<string, unknown>;
      const title = text(r.title, 160);
      const url = httpsUrl(r.url);
      const kind = (RESOURCE_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as ResourceKind) : null;
      if (!title || !url || !kind) continue;
      const courses = phrases(r.courses);
      resources.push({
        title,
        url,
        kind,
        source: text(r.source, 80),
        rights: text(r.rights, 160) || null,
        group: text(r.group, 120) || null,
        courses: courses.length ? courses : null,
      });
    }
    subjects.push({ id, name, match, resources });
  }
  return { subjects };
}

/** The first subject (file order) with a phrase in the class title. Explicit
 *  phrases only: a class that matches nothing gets nothing, never a guess. */
export function subjectForClass(title: string, library: StudyLibrary): StudySubject | null {
  const t = title.toLowerCase();
  return library.subjects.find((s) => s.match.some((p) => t.includes(p))) ?? null;
}

export interface ClassResources {
  subject: StudySubject;
  /** In the order of RESOURCE_KINDS; kinds with nothing are left out. */
  byKind: { kind: ResourceKind; resources: StudyResource[] }[];
  count: number;
}

/** A class's shared resources, grouped by kind, or null when its subject
 *  isn't in the library (or has nothing for this particular class). */
export function resourcesForClass(title: string, library: StudyLibrary): ClassResources | null {
  const subject = subjectForClass(title, library);
  if (!subject) return null;
  const t = title.toLowerCase();
  const mine = subject.resources.filter((r) => !r.courses || r.courses.some((p) => t.includes(p)));
  if (!mine.length) return null;
  const byKind = RESOURCE_KINDS.map((kind) => ({ kind, resources: mine.filter((r) => r.kind === kind) })).filter((g) => g.resources.length);
  return { subject, byKind, count: mine.length };
}
