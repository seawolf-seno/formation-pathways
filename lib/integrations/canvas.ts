/**
 * Canvas integration.
 *
 * The Bearer-token REST client and Link: rel="next" pagination approach below
 * are reused from a Pacifica student's own Canvas-connected app — Levi
 * Gibbons, github.com/levihgibbons1/canvasnotifications — per the Forge
 * thesis: student-built software becoming real school infrastructure.
 * Credited in the app footer.
 *
 * MOCK_INTEGRATIONS is on by default so the exec demo runs with zero live
 * credentials; a real per-teacher API token switches to LiveCanvasSource.
 *
 * Safety note: when live Canvas IS configured, callers must run the result
 * through pseudonymizeToRoster() before it touches storage or a Claude call
 * — see lib/actions.ts syncCourseAction. A real student's real name from
 * Canvas should never be persisted or sent to a third-party API by this app.
 */

export interface CanvasAssignmentScore {
  assignmentName: string;
  pointsPossible: number | null;
  score: number | null;
  submittedAt: string | null;
  late: boolean;
  missing: boolean;
  comment: string | null;
}

export interface CanvasStudentRecord {
  studentName: string;
  assignments: CanvasAssignmentScore[];
}

export interface CanvasSyncResult {
  courseName: string;
  students: CanvasStudentRecord[];
  syncedAt: string;
}

export interface CanvasSource {
  fetchCourseData(
    canvasCourseId: string,
    studentNames: string[],
    courseName?: string
  ): Promise<CanvasSyncResult>;
}

class CanvasApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Thin, paginating client for the real Canvas LMS REST API. */
export class LiveCanvasSource implements CanvasSource {
  private baseUrl: string;
  constructor(
    baseUrl: string,
    private token: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request<T>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<{ data: T; next?: string }> {
    const url = path.startsWith("http")
      ? new URL(path)
      : new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CanvasApiError(
        res.status,
        `Canvas ${res.status} on ${url.pathname}: ${text.slice(0, 200)}`
      );
    }
    const link = res.headers.get("link") ?? "";
    const next = link
      .split(",")
      .map((s) => s.trim())
      .find((s) => s.endsWith('rel="next"'))
      ?.match(/<([^>]+)>/)?.[1];
    return { data: (await res.json()) as T, next };
  }

  async getAll<T>(
    path: string,
    params: Record<string, unknown> = {},
    maxPages = 20
  ): Promise<T[]> {
    const out: T[] = [];
    let { data, next } = await this.request<T[]>(path, { per_page: 100, ...params });
    out.push(...data);
    let pages = 1;
    while (next && pages < maxPages) {
      ({ data, next } = await this.request<T[]>(next));
      out.push(...data);
      pages++;
    }
    return out;
  }

  /** Fetches by real Canvas user id, not display-name matching — the roster
   *  comes straight from Canvas's own enrollment list, so it's correct
   *  regardless of what names the caller happens to know locally. */
  async fetchCourseData(
    canvasCourseId: string,
    _studentNames: string[],
    _courseName?: string
  ): Promise<CanvasSyncResult> {
    const course = await this.request<{ name: string }>(
      `/courses/${canvasCourseId}`
    ).then((r) => r.data);

    const users = await this.getAll<{ id: number; name: string }>(
      `/courses/${canvasCourseId}/users`,
      { "enrollment_type[]": "student" }
    );

    const assignments = await this.getAll<{
      id: number;
      name: string;
      points_possible: number | null;
    }>(`/courses/${canvasCourseId}/assignments`, { order_by: "due_at" });

    const submissions = await this.getAll<{
      user: { id: number };
      assignment_id: number;
      score: number | null;
      submitted_at: string | null;
      late: boolean;
      missing: boolean;
      submission_comments?: { comment: string }[];
    }>(`/courses/${canvasCourseId}/students/submissions`, {
      "student_ids[]": "all",
      "include[]": ["user", "submission_comments"],
    });

    const byStudentId = new Map<number, CanvasStudentRecord>();
    for (const u of users) byStudentId.set(u.id, { studentName: u.name, assignments: [] });

    for (const sub of submissions) {
      const record = byStudentId.get(sub.user?.id);
      if (!record) continue;
      const assignment = assignments.find((a) => a.id === sub.assignment_id);
      record.assignments.push({
        assignmentName: assignment?.name ?? `Assignment ${sub.assignment_id}`,
        pointsPossible: assignment?.points_possible ?? null,
        score: sub.score,
        submittedAt: sub.submitted_at,
        late: Boolean(sub.late),
        missing: Boolean(sub.missing),
        comment: sub.submission_comments?.[0]?.comment ?? null,
      });
    }

    return {
      courseName: course.name,
      students: Array.from(byStudentId.values()),
      syncedAt: new Date().toISOString(),
    };
  }
}

const MOCK_ASSIGNMENT_TEMPLATES: Omit<CanvasAssignmentScore, "score">[] = [
  { assignmentName: "Problem Set 1", pointsPossible: 20, submittedAt: daysAgo(30), late: false, missing: false, comment: null },
  { assignmentName: "Lab Report: Motion", pointsPossible: 50, submittedAt: daysAgo(21), late: false, missing: false, comment: "Clear methodology, but check your error bars." },
  { assignmentName: "Problem Set 2", pointsPossible: 20, submittedAt: daysAgo(14), late: true, missing: false, comment: null },
  { assignmentName: "Midterm Reflection", pointsPossible: 30, submittedAt: daysAgo(7), late: false, missing: false, comment: "Real growth in how you explain your reasoning." },
  { assignmentName: "Lab Report: Energy", pointsPossible: 50, submittedAt: null, late: false, missing: true, comment: null },
];

/** Deterministic, realistic seeded Canvas data — same shape every call so a
 *  fresh seed and a demo-time "Sync from Canvas" click agree. */
export function buildMockCanvasSyncResult(
  courseName: string,
  studentNames: string[]
): CanvasSyncResult {
  const students: CanvasStudentRecord[] = studentNames.map((studentName, i) => ({
    studentName,
    assignments: MOCK_ASSIGNMENT_TEMPLATES.map((t, j) => ({
      ...t,
      score:
        t.missing || !t.submittedAt
          ? null
          : Math.round((t.pointsPossible ?? 0) * (0.68 + ((i * 7 + j * 13) % 30) / 100)),
    })),
  }));

  return { courseName, students, syncedAt: new Date().toISOString() };
}

declare global {
  var __mockCanvasWorlds: Map<string, CanvasSyncResult> | undefined;
}
const mockWorlds = global.__mockCanvasWorlds ?? new Map<string, CanvasSyncResult>();
if (process.env.NODE_ENV !== "production") global.__mockCanvasWorlds = mockWorlds;

/** A persistent (per server process) mock world per course, so a "Simulate
 *  Canvas activity" click during a live demo actually sticks across syncs
 *  instead of regenerating fresh every time. */
function getOrCreateMockWorld(
  worldKey: string,
  courseName: string,
  studentNames: string[]
): CanvasSyncResult {
  const existing = mockWorlds.get(worldKey);
  if (existing && existing.students.length === studentNames.length) return existing;
  const world = buildMockCanvasSyncResult(courseName, studentNames);
  mockWorlds.set(worldKey, world);
  return world;
}

const SIMULATED_COMMENTS = [
  "Real growth since last time — keep pushing.",
  "This is your strongest work yet on this kind of problem.",
  "Nice recovery after a rough start on this one.",
  "You helped a classmate work through their approach today — noticed that.",
  "Cleaner reasoning than last time. Keep showing your work like this.",
];

/** Nudges a course's mock world forward — a new grade lands, or a comment is
 *  added — so a live demo can show the whole sync+mapping pipeline react in
 *  real time. Reuses the spirit of simulateActivity() from the credited
 *  student's own Canvas app. Mock only; has no effect on a real Canvas. */
export function simulateCanvasActivity(worldKey: string): string | null {
  const world = mockWorlds.get(worldKey);
  if (!world || world.students.length === 0) return null;

  const student = world.students[Math.floor(Math.random() * world.students.length)];
  const assignment =
    student.assignments[Math.floor(Math.random() * student.assignments.length)];

  const wasMissing = assignment.missing;
  assignment.missing = false;
  assignment.submittedAt = assignment.submittedAt ?? new Date().toISOString();
  assignment.score = Math.round(
    (assignment.pointsPossible ?? 20) * (0.72 + Math.random() * 0.26)
  );
  assignment.comment =
    SIMULATED_COMMENTS[Math.floor(Math.random() * SIMULATED_COMMENTS.length)];
  world.syncedAt = new Date().toISOString();

  return wasMissing
    ? `${student.studentName} turned in "${assignment.assignmentName}" — graded ${assignment.score}/${assignment.pointsPossible}`
    : `New grade posted for ${student.studentName} on "${assignment.assignmentName}": ${assignment.score}/${assignment.pointsPossible}`;
}

export function ensureMockWorld(
  worldKey: string,
  courseName: string,
  studentNames: string[]
): void {
  getOrCreateMockWorld(worldKey, courseName, studentNames);
}

/** Realistic seeded Canvas data so the exec demo never depends on a live key. */
export class MockCanvasSource implements CanvasSource {
  async fetchCourseData(
    canvasCourseId: string,
    studentNames: string[],
    courseName = "Mock Canvas Course"
  ): Promise<CanvasSyncResult> {
    return getOrCreateMockWorld(canvasCourseId, courseName, studentNames);
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Live Canvas for the DEMO is a local-only validation tool. In production the
 *  demo always uses the mock: the pilot's own importer
 *  (lib/sor/importers/canvas.ts) shares CANVAS_* and is the only path real
 *  Canvas data may take there, under its course allowlist and consent. */
export function isLiveCanvasConfigured(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MOCK_INTEGRATIONS === "false" &&
    Boolean(process.env.CANVAS_API_TOKEN) &&
    Boolean(process.env.CANVAS_BASE_URL)
  );
}

export function getCanvasSource(): CanvasSource {
  if (isLiveCanvasConfigured()) {
    return new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  }
  return new MockCanvasSource();
}

/**
 * Renames each Canvas student positionally onto the app's own local roster
 * names, discarding the real Canvas name immediately. Use this on every
 * live Canvas fetch before the result is stored or sent to Claude — a real
 * student's real name should never persist in this app or leave it toward
 * a third-party API. Extra real students beyond the local roster size are
 * dropped rather than left unrenamed.
 */
export function pseudonymizeToRoster(
  canvasData: CanvasSyncResult,
  localRosterNames: string[]
): CanvasSyncResult {
  return {
    ...canvasData,
    students: canvasData.students
      .slice(0, localRosterNames.length)
      .map((s, i) => ({ ...s, studentName: localRosterNames[i] })),
  };
}
