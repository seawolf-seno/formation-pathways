// Removes people from anything the system of record sends to Anthropic, and
// puts them back in what comes back. Runs locally; the name map never leaves
// the server.
//
// What's replaced before sending:
// - every known name: the student ([STUDENT], surname [FAMILY]), their parent on an inquiry
//   ([PARENT 1]), other students the staff member can see ([PERSON n]) and
//   staff named in the record ([STAFF n]);
// - emails, phone numbers, links, street addresses and long id numbers.
// assertNoNames() is the last check before a call: it refuses if any known
// name is still in the payload.
//
// What it can't know: a name that isn't in our records (a sibling, a friend
// from another school). docs/ai-anonymization.md says so, and staff can see
// exactly what's sent on the person and inquiry pages.

export interface NamedPerson {
  first: string;
  last?: string | null;
  preferred?: string | null;
}

type Kind = "STUDENT" | "PARENT" | "PERSON" | "STAFF";

const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "coach", "pastor", "rev", "fr", "sr", "jr", "ii", "iii", "iv"]);
/** Surname particles: dropped only when the name has other parts. */
const PARTICLES = new Set(["de", "la", "del", "della", "der", "den", "van", "von", "da", "di", "du", "le", "el", "al", "bin", "st"]);
/** Names that are also ordinary words: replaced only when capitalized. */
const WORD_NAMES = new Set(
  ("grace hope faith joy will mark rose may june april august summer autumn winter hunter mason jack bill pat sky skye river " +
    "brook brooke dawn eve ivy lily iris jade ruby pearl amber crystal sage rich chase drew guy art bob carol frank gene ray " +
    "sandy wade wood woods young king brown white black green gray grey hill bush park long little rice price love lord bishop " +
    "christian sterling golden page reed read ward hall ball bell cook ford fox gold hart hunt lane moon pope rush snow west " +
    "wild wise wolf stone church small strong short sharp glass may miles bishop dean penny holly heath cliff forest storm " +
    "rain sunny honey cash pierce major noble royal chance justice true blue reign journey harmony melody trinity genesis " +
    "angel ace max win") .split(/\s+/),
);

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "");

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function nameParts(name: string | null | undefined): string[] {
  const parts = norm(name ?? "")
    .split(/[\s-]+/)
    .map((p) => p.replace(/[^a-z]/g, ""))
    .filter((p) => p.length >= 2 && !TITLES.has(p));
  return parts.length > 1 ? parts.filter((p) => !PARTICLES.has(p)) : parts;
}

const PATTERNS: [RegExp, string][] = [
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[LINK]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]"],
  [/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[PHONE]"],
  [
    /\b\d{1,6}\s+(?:[A-Z][\w'’.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Ter|Terrace|Pkwy|Parkway|Hwy|Highway)\b/g,
    "[ADDRESS]",
  ],
  [/\b\d{6,}\b/g, "[NUMBER]"],
];

// A word, with an optional possessive. Hyphenated words stay whole.
const WORD = /[\p{L}][\p{L}\p{M}’'-]*/gu;
const TOKEN = /\[(STUDENT|FAMILY|PARENT|PERSON|STAFF)(?: (\d+))?\]/gi;

export class Pseudonymizer {
  private exact = new Map<string, string>();
  private fuzzy: { part: string; token: string }[] = [];
  private display = new Map<string, string>();
  private counts: Record<Kind, number> = { STUDENT: 0, PARENT: 0, PERSON: 0, STAFF: 0 };

  constructor(opts: {
    student: NamedPerson;
    parents?: NamedPerson[];
    others?: NamedPerson[];
    /** Staff display names as written ("Mrs. Chen", "Steven Eno"). */
    staff?: (string | null | undefined)[];
  }) {
    // The student first, so a name they share with someone else is theirs.
    this.add("STUDENT", opts.student, opts.student.preferred || opts.student.first, true);
    for (const p of opts.parents ?? []) this.add("PARENT", p, p.first, false);
    for (const p of opts.others ?? []) this.add("PERSON", p, p.preferred || p.first, true);
    for (const s of opts.staff ?? []) if (s?.trim()) this.add("STAFF", { first: s }, s.trim(), false);
  }

  private add(kind: Kind, p: NamedPerson, shown: string, fuzzy: boolean) {
    const parts = [...nameParts(p.first), ...nameParts(p.last), ...nameParts(p.preferred)];
    if (!parts.length) return;
    // The same person listed twice (staff and observation author) keeps one
    // token. Sharing only a surname (a parent) does not make them the same.
    const tokens = new Set(parts.map((x) => this.exact.get(x)));
    if (tokens.size === 1 && !tokens.has(undefined)) return;
    const n = ++this.counts[kind];
    const token = kind === "STUDENT" && n === 1 ? "[STUDENT]" : `[${kind} ${n}]`;
    this.display.set(token, shown.trim());
    // The student's surname is the family's: "Grace Okafor" is [PARENT 1],
    // "the Okafor family" is "the [FAMILY] family", never the student.
    if (token === "[STUDENT]" && p.last?.trim()) {
      this.display.set("[FAMILY]", p.last.trim());
      for (const part of nameParts(p.last)) {
        this.exact.set(part, "[FAMILY]");
        if (part.length >= 5) this.fuzzy.push({ part, token: "[FAMILY]" });
      }
    }
    for (const part of parts) {
      if (this.exact.has(part)) continue;
      this.exact.set(part, token);
      if (fuzzy && part.length >= 5) this.fuzzy.push({ part, token });
    }
  }

  /** The token a single word stands for, or null. */
  private match(word: string, fuzzy = false): string | null {
    const capitalized = /^\p{Lu}/u.test(word);
    for (const piece of word.split("-")) {
      const key = norm(piece).replace(/[^a-z]/g, "");
      if (!key) continue;
      const hit = this.exact.get(key);
      if (hit && (capitalized || (key.length >= 3 && !WORD_NAMES.has(key)))) return hit;
      // Speech-to-text misspellings ("Okonko" for "Okonkwo"): dictation only,
      // capitalized only. Elsewhere it would catch real words ("Christ").
      if (fuzzy && capitalized && key.length >= 5) {
        for (const f of this.fuzzy) {
          if (Math.abs(f.part.length - key.length) > 2) continue;
          if (distance(key, f.part) <= (f.part.length >= 8 ? 2 : 1)) return f.token;
        }
      }
    }
    return null;
  }

  /** Text with every known name and contact detail replaced. `dictation`
   *  also catches near-misses of student names from speech-to-text. */
  scrub(text: string, opts: { dictation?: boolean } = {}): string {
    let out = text;
    for (const [re, label] of PATTERNS) out = out.replace(re, label);
    out = out.replace(WORD, (w) => {
      const m = /^(.*?)(['’]s|['’])?$/u.exec(w)!;
      const token = this.match(m[1], opts.dictation);
      return token ? token + (m[2] ?? "") : w;
    });
    // "Levi Gibbons" → "[STUDENT] [STUDENT]" → "[STUDENT]". A staff title
    // goes with the name, so "Mrs. Alvarez" comes back once, not "Mrs. Mrs.".
    return out
      .replace(/(\[[A-Z]+(?: \d+)?\])(?:\s+\1)+/g, "$1")
      .replace(/(\[(?:STUDENT|PARENT \d+)\])\s+\[FAMILY\]/g, "$1")
      .replace(/\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Coach|Pastor)\.?\s+(\[STAFF \d+\])/g, "$1");
  }

  /** Placeholders back to names, for what Claude returns. */
  restore(text: string): string {
    return text.replace(TOKEN, (t, kind: string, n?: string) => {
      const key = `[${kind.toUpperCase()}${n ? ` ${n}` : ""}]`;
      return this.display.get(key) ?? (kind.toUpperCase() === "STAFF" ? "a teacher" : "someone");
    });
  }

  /** Every known name still present in text (should be none after scrub). */
  findNames(text: string): string[] {
    const found = new Set<string>();
    for (const w of text.match(WORD) ?? []) {
      const base = w.replace(/['’]s?$/u, "");
      if (this.match(base)) found.add(base);
    }
    return [...found];
  }

  /** The last check before anything is sent. Throws, naming no one. */
  assertNoNames(payload: string): void {
    const left = this.findNames(payload);
    if (left.length) {
      throw new Error(
        `Stopped before sending: ${left.length} name${left.length === 1 ? "" : "s"} still in what would go to the AI. Nothing was sent.`,
      );
    }
  }

  scrubDeep<T>(value: T): T {
    return mapStrings(value, (s) => this.scrub(s));
  }

  restoreDeep<T>(value: T): T {
    return mapStrings(value, (s) => this.restore(s));
  }
}

function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === "string") return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)])) as T;
  }
  return value;
}
