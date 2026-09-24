// Pure inquiry-stage logic: school matching and nurture-email drafts. No I/O.
//
// At inquiry we know very little (a first name, an email, a prior school,
// maybe an interest). Copy here must never imply we know the child; it can only
// say what is true of *other* Pacifica students who came from the same school.

export interface AlumniStory {
  id: number;
  school_key: string;
  first_name: string;
  grad_year: number;
  headline: string;
  story: string;
  pathway_name: string;
  where_now: string;
  is_fictional: number;
  /** Only stories with a recorded consent are ever shown. */
  consent_confirmed: number;
}

export interface Inquiry {
  id: number;
  first_name: string;
  email: string;
  prior_school: string;
  interests: string | null;
  created_at: string;
}

const STOPWORDS = new Set(["the", "of", "school", "middle", "junior", "high", "jr", "elementary", "academy"]);

/** "Paul Revere Middle School" -> "paul-revere". Empty input -> "". */
export function schoolKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join("-");
}

/** Prefer stories from the applicant's own school; fall back to the general set. */
export function pickStories(all: AlumniStory[], priorSchool: string): {
  stories: AlumniStory[];
  sameSchool: boolean;
} {
  const usable = all.filter((s) => s.consent_confirmed === 1);
  const key = schoolKey(priorSchool);
  const own = key ? usable.filter((s) => s.school_key === key) : [];
  if (own.length > 0) return { stories: own, sameSchool: true };
  return { stories: usable.filter((s) => s.school_key === "all"), sameSchool: false };
}

export interface NurtureDraft {
  dayOffset: number;
  subject: string;
  body: string;
}

/**
 * Three short, warm messages for staff to review. Deterministic on purpose:
 * nothing here is AI-written, and nothing sends itself.
 */
export function buildNurtureDrafts(
  inquiry: Pick<Inquiry, "first_name" | "prior_school" | "interests">,
  stories: AlumniStory[],
  sameSchool: boolean,
  pageUrl: string,
  admissionsUrl: string
): NurtureDraft[] {
  const name = inquiry.first_name;
  const school = inquiry.prior_school.trim();
  const first = stories[0];
  const second = stories[1] ?? stories[0];
  const from = sameSchool
    ? `Pacifica students who also came from ${school}`
    : "Pacifica students from schools like yours";

  const interest = inquiry.interests?.trim();
  const interestLine = interest
    ? `You mentioned an interest in ${interest}. Students here have taken that in more directions than they expected.`
    : "Every student here starts somewhere different, and ends up somewhere they didn't plan.";

  const drafts: NurtureDraft[] = [];

  drafts.push({
    dayOffset: 0,
    subject: sameSchool
      ? `${name}, some Pacifica students came from ${school} too`
      : `${name}, meet a few Pacifica students`,
    body: [
      `Hi ${name},`,
      ``,
      `Thanks for your interest in Pacifica Christian. We wanted you to hear from ${from}.`,
      first ? `\n${first.first_name} ('${String(first.grad_year).slice(-2)}): ${first.headline}` : "",
      ``,
      `Their stories are here: ${pageUrl}`,
      ``,
      `We'd love to get to know you too. There's no application needed to look around.`,
    ].join("\n"),
  });

  drafts.push({
    dayOffset: 5,
    subject: `A path you might not have pictured`,
    body: [
      `Hi ${name},`,
      ``,
      interestLine,
      second ? `\nFor ${second.first_name}, it became "${second.pathway_name}". Where ${second.first_name} is now: ${second.where_now}` : "",
      ``,
      `Read more: ${pageUrl}`,
      ``,
      `Pathways aren't predictions. They're invitations.`,
    ].join("\n"),
  });

  drafts.push({
    dayOffset: 12,
    subject: `Come see it, and bring a friend`,
    body: [
      `Hi ${name},`,
      ``,
      `The best way to know if Pacifica fits is to visit. Start here: ${admissionsUrl}`,
      ``,
      `If a friend is looking at high schools too, feel free to send them this page: ${pageUrl}`,
    ].join("\n"),
  });

  return drafts;
}
