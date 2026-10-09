// The /discover inquiry form: its choices, the consent wording, and the
// validation that mirrors the database's own checks
// (supabase/migrations/20261009000000_inquiries.sql), so a family sees a
// plain message instead of a database error. Pure; tested in
// tests/discover.test.mjs.

/** Bump when the consent wording changes; stored with every inquiry. */
export const INQUIRY_CONSENT_VERSION = "2026-10-v1";

// DRAFT wording for leadership to approve before the form opens (card #29).
export const CONSENT_CONTACT =
  "Pacifica Christian may contact me about admissions using the details above, and may keep this inquiry for up to 18 months if we don't apply.";
export const CONSENT_PATHWAY =
  "Please prepare a Formation Pathway for my child from what I've shared. It's drafted with the help of AI, then reviewed and signed by a member of the admissions team before we see it.";

export const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Other"] as const;
export const GRADES = [9, 10, 11, 12] as const;

// The same labels as Pacifica's current Finalsite inquiry form, so exported
// values match Finalsite's own lists.
export const AREAS = ["STEM", "Humanities", "Visual/Performing Arts", "Business/Entrepreneurship", "Athletics"] as const;
export const SPORTS = [
  "Baseball", "Basketball", "Beach Volleyball", "Cross Country", "Flag Football",
  "Golf", "Soccer", "Surf", "Tennis", "Track", "Volleyball",
] as const;

/** The next few falls a child could start, from today. */
export function entryYears(now: Date = new Date()): number[] {
  // After March, this fall's class is mostly decided; lead with next fall.
  const first = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return [first, first + 1, first + 2];
}

/** A referral code from a link, or null. Codes are 8 letters/digits. */
export function cleanRef(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9]{8}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
}

export type InquirySource = "website" | "share" | "direct";
/** Only "website" is taken from the link; "share" is decided by the database from a real code. */
export function cleanSource(value: unknown): "website" | "direct" {
  return value === "website" ? "website" : "direct";
}

export interface InquiryPayload {
  parent_first_name: string;
  parent_last_name: string;
  parent_relationship: string;
  parent_email: string;
  parent_phone: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: number;
  entry_year: number;
  current_school: string;
  one_thing: string;
  interests: string[];
  consent_contact: boolean;
  consent_pathway: boolean;
  consent_version: string;
  source: "website" | "direct";
  ref: string | null;
}

export type InquiryErrors = Partial<Record<keyof InquiryPayload, string>>;

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Checks what a family typed. Field limits match the database's. */
export function validateInquiry(
  input: Record<string, unknown>,
  now: Date = new Date()
): { ok: true; payload: InquiryPayload } | { ok: false; errors: InquiryErrors } {
  const errors: InquiryErrors = {};
  const need = (key: keyof InquiryPayload, max: number, label: string) => {
    const v = text(input[key]);
    if (!v) errors[key] = `Please add ${label}.`;
    else if (v.length > max) errors[key] = `That's longer than we can keep (${max} characters).`;
    return v.slice(0, max);
  };
  const opt = (key: keyof InquiryPayload, max: number) => {
    const v = text(input[key]);
    if (v.length > max) errors[key] = `That's longer than we can keep (${max} characters).`;
    return v.slice(0, max);
  };

  const childFirst = need("child_first_name", 80, "your child's first name");
  const childLast = need("child_last_name", 80, "your child's last name");
  const grade = Number(input.child_grade);
  if (!GRADES.includes(grade as (typeof GRADES)[number])) errors.child_grade = "Please choose a grade.";
  const year = Number(input.entry_year);
  if (!entryYears(now).includes(year)) errors.entry_year = "Please choose a year.";
  const school = opt("current_school", 200);
  const oneThing = typeof input.one_thing === "string" ? input.one_thing.trim() : "";
  if (oneThing.length > 1000) errors.one_thing = "That's longer than we can keep (1,000 characters).";

  const known = new Set<string>([...AREAS, ...SPORTS]);
  const rawInterests = Array.isArray(input.interests) ? input.interests : [];
  const interests = [...new Set(rawInterests.map(text).filter((i) => known.has(i)))].slice(0, 20);

  const parentFirst = need("parent_first_name", 80, "your first name");
  const parentLast = need("parent_last_name", 80, "your last name");
  const relationship = text(input.parent_relationship);
  if (!(RELATIONSHIPS as readonly string[]).includes(relationship)) errors.parent_relationship = "Please choose how you're related.";
  const email = text(input.parent_email).toLowerCase();
  if (!email) errors.parent_email = "Please add your email.";
  else if (!EMAIL.test(email) || email.length > 200) errors.parent_email = "That email doesn't look right.";
  const phone = opt("parent_phone", 40);

  const address1 = need("address_1", 200, "your street address");
  const address2 = opt("address_2", 200);
  const city = need("city", 100, "your city");
  const state = need("state", 100, "your state");
  const zip = need("zip", 20, "your ZIP code");
  const country = text(input.country) || "United States";

  const consentContact = input.consent_contact === true || input.consent_contact === "on" || input.consent_contact === "true";
  if (!consentContact) errors.consent_contact = "We need your permission to contact you about your inquiry.";
  const consentPathway = input.consent_pathway === true || input.consent_pathway === "on" || input.consent_pathway === "true";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      parent_first_name: parentFirst,
      parent_last_name: parentLast,
      parent_relationship: relationship,
      parent_email: email,
      parent_phone: phone,
      address_1: address1,
      address_2: address2,
      city,
      state,
      zip,
      country: country.slice(0, 100),
      child_first_name: childFirst,
      child_last_name: childLast,
      child_grade: grade,
      entry_year: year,
      current_school: school,
      one_thing: oneThing,
      interests,
      consent_contact: true,
      consent_pathway: consentPathway,
      consent_version: INQUIRY_CONSENT_VERSION,
      source: cleanSource(input.source),
      ref: cleanRef(input.ref),
    },
  };
}

// ---------------------------------------------------------------- after they inquire

/** What the welcome page says about each area a family picks. Written by
 *  people, from real programs in prompts/pacifica-context.txt. No AI. */
export const PROGRAM_MATCHES: Record<string, { program: string; line: string }> = {
  STEM: {
    program: "STEM Scholars",
    line: "Science and engineering with STEM Scholars, and clubs like the Drone Club and the student-led Makers Space.",
  },
  Humanities: {
    program: "The Center for Philosophy & Theology",
    line: "Small Oxford-style seminars on first principles, where understanding a view you disagree with is the point.",
  },
  "Visual/Performing Arts": {
    program: "PACARTS",
    line: "Theater, visual arts, film and photography, music and dance with working artist-instructors, ending each year in the i.Sight Festival.",
  },
  "Business/Entrepreneurship": {
    program: "The Minchin Center",
    line: "Shark-Tank-style pitches, and The Wolf Shack: a real campus store that students run, from inventory to profit.",
  },
  Athletics: {
    program: "Wolfpack Athletics",
    line: "Process over product: player development and character alongside winning, whether a student specializes or plays several sports.",
  },
};

/** A first week at Pacifica, for every welcome page. Written by people, the
 *  same for every family, never generated. DRAFT: built only from what
 *  prompts/pacifica-context.txt says is real; admissions should rewrite it
 *  in their own words with true first-week details (docs/admissions-phone-test.md). */
export const FIRST_WEEK: { moment: string; line: string }[] = [
  { moment: "A home game", line: "The Wolfpack, Pacifica's student section, turns out for home games." },
  { moment: "The Wolf Shack", line: "A campus store run by students, from what to stock to what to charge." },
  { moment: "A real question", line: "Open, honest conversation about faith is welcome here, whatever a student's background." },
];

/** The programs to show for what a family picked; a sport counts as Athletics. */
export function welcomeMatches(interests: string[]): { program: string; line: string }[] {
  const areas = new Set(interests.filter((i) => i in PROGRAM_MATCHES));
  if (interests.some((i) => (SPORTS as readonly string[]).includes(i))) areas.add("Athletics");
  return AREAS.filter((a) => areas.has(a)).map((a) => PROGRAM_MATCHES[a]);
}

/** What a pathway draft is built from: the family's own words first. */
export function inquiryDraftInput(i: {
  child_first_name: string;
  child_grade: number;
  entry_year: number;
  current_school: string | null;
  one_thing: string | null;
  interests: string[];
}): { answers: { question: string; answer: string }[]; context: string } {
  const answers = [
    ...(i.one_thing ? [{ question: "One thing about my child that a brochure would miss", answer: i.one_thing }] : []),
    ...(i.current_school ? [{ question: "Where my child goes to school now", answer: i.current_school }] : []),
  ];
  const context = [
    `${i.child_first_name} would start in grade ${i.child_grade}, fall ${i.entry_year}.`,
    i.interests.length ? `The family marked these interests on the inquiry form: ${i.interests.join(", ")}.` : "",
    "This is an inquiry, not an application: the family has shared only what is above.",
  ]
    .filter(Boolean)
    .join("\n");
  return { answers, context };
}
