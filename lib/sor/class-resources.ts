// Study links students suggest for their own classes (class_resources): a
// video, a practice set, a reading that helped. A suggestion is shown to
// others taking that class only after a teacher or admin approves it. Links
// only; no files. Pure: validation and how suggestions line up with a
// student's classes. No I/O.

import type { ReflectionClass } from "./class-reflections.ts";
import { RESOURCE_KINDS, httpsUrl, type ResourceKind } from "./study-library.ts";

export type ResourceStatus = "pending" | "approved" | "declined";

/** A `class_resources` row. */
export interface ClassResource {
  id: string;
  person_id: string;
  class_title: string;
  class_key: string;
  title: string;
  url: string;
  kind: ResourceKind;
  note: string;
  status: ResourceStatus;
  created_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
}

/** What a student can call a link they're adding, in the order offered. */
export const SUGGESTION_KINDS: ResourceKind[] = ["Video", "Practice", "Open reading", "Reference", "Past exam"];

export const MAX_TITLE_LENGTH = 160;
export const MAX_NOTE_LENGTH = 300;
export const MAX_URL_LENGTH = 500;

/** How a class title is matched between students: same title, any case. No
 *  guessing across titles ("AP Chemistry" and "Chemistry" stay separate). */
export const classKey = (title: string) => title.trim().toLowerCase();

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface ResourceSuggestion {
  classTitle: string;
  title: string;
  url: string;
  kind: ResourceKind;
  note: string;
}

/** Clean copy of what the browser sent, or a plain error. The class must be
 *  one of the student's own (read on the server), and its title comes from
 *  their schedule, never from the browser. */
export function validateResourceSuggestion(
  raw: unknown,
  classes: ReflectionClass[]
): { ok: true; suggestion: ResourceSuggestion } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cls = classes.find((c) => c.key === r.classKey);
  if (!cls) return { ok: false, error: "Choose one of your own classes." };
  const title = clip(r.title, MAX_TITLE_LENGTH);
  if (!title) return { ok: false, error: "Give it a name, so others know what it is." };
  const typed = clip(r.url, MAX_URL_LENGTH + 1);
  if (typed.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long. Try the short version of it." };
  // People paste "www.example.org/page"; a link with no scheme gets https.
  const url = httpsUrl(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
  if (!url || /\s/.test(typed) || !new URL(url).hostname.includes(".")) {
    return { ok: false, error: "That doesn't look like a link. Paste the address of the page, starting with https://" };
  }
  const kind = (RESOURCE_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as ResourceKind) : "Reference";
  return { ok: true, suggestion: { classTitle: cls.title, title, url, kind, note: clip(r.note, MAX_NOTE_LENGTH) } };
}

/** A student's Study Hub view of suggestions for one class. */
export interface ClassSuggestions {
  /** Approved by a teacher: shown to everyone taking the class, with no names. */
  approved: ClassResource[];
  /** This student's own, still waiting for a teacher to look. */
  waiting: ClassResource[];
}

/** Lines suggestions up with a student's classes by title. Declined ones are
 *  never shown to a student, and nobody else's unreviewed ones are either. */
export function suggestionsByClass(rows: ClassResource[], personId: string, classes: ReflectionClass[]): Map<string, ClassSuggestions> {
  const out = new Map<string, ClassSuggestions>();
  for (const c of classes) {
    const key = classKey(c.title);
    const mine = rows.filter((r) => r.class_key === key);
    out.set(c.key, {
      approved: mine.filter((r) => r.status === "approved"),
      waiting: mine.filter((r) => r.status === "pending" && r.person_id === personId),
    });
  }
  return out;
}
