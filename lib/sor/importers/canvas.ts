import fs from "fs";
import path from "path";
import { LiveCanvasSource } from "@/lib/integrations/canvas";

/**
 * Canvas → course_enrollments + academic_evidence (assignment names, timing,
 * teacher comments — never scores; Formation Pathways shows no numbers, so
 * it holds none).
 *
 * Live mode reuses the Bearer/pagination client from lib/integrations/canvas.ts
 * (built on Levi Gibbons' canvasnotifications). It reads only the courses in
 * CANVAS_PILOT_COURSE_IDS and asks Canvas only about allowlisted user ids
 * (user_ids[] / student_ids[]), so other students' data is never requested.
 * A personal teacher token can only see that teacher's own courses — which
 * is the intended scope for a pilot.
 */
export interface CanvasEvidence {
  assignmentName: string;
  submittedAt: string | null;
  late: boolean;
  missing: boolean;
  teacherComment: string | null;
}

export interface CanvasCourseRecord {
  canvasCourseId: string;
  courseName: string;
  teacherName: string | null;
  students: { externalId: string; evidence: CanvasEvidence[] }[];
}

export function isLiveCanvasPilotConfigured(): boolean {
  return Boolean(
    process.env.CANVAS_BASE_URL &&
      process.env.CANVAS_API_TOKEN &&
      process.env.CANVAS_PILOT_COURSE_IDS
  );
}

export async function fetchLiveCanvas(allowlist: Set<string>): Promise<CanvasCourseRecord[]> {
  const client = new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  const ids = [...allowlist];
  if (!ids.length) return [];
  const courseIds = process.env.CANVAS_PILOT_COURSE_IDS!.split(",").map((s) => s.trim()).filter(Boolean);
  const out: CanvasCourseRecord[] = [];

  for (const courseId of courseIds) {
    const { data: course } = await client.request<{
      name: string;
      teachers?: { display_name: string }[];
    }>(`/courses/${courseId}`, { "include[]": "teachers" });

    const enrolled = await client.getAll<{ id: number }>(`/courses/${courseId}/users`, {
      "enrollment_type[]": "student",
      "user_ids[]": ids,
    });
    const present = new Set(enrolled.map((u) => String(u.id)).filter((id) => allowlist.has(id)));
    if (!present.size) continue;

    const submissions = await client.getAll<{
      user_id: number;
      submitted_at: string | null;
      late: boolean;
      missing: boolean;
      assignment?: { name: string };
      submission_comments?: { comment: string }[];
    }>(`/courses/${courseId}/students/submissions`, {
      "student_ids[]": [...present],
      "include[]": ["assignment", "submission_comments"],
    });

    out.push({
      canvasCourseId: courseId,
      courseName: course.name,
      teacherName: course.teachers?.[0]?.display_name ?? null,
      students: [...present].map((externalId) => ({
        externalId,
        evidence: submissions
          .filter((s) => String(s.user_id) === externalId)
          .map((s) => ({
            assignmentName: s.assignment?.name ?? "Assignment",
            submittedAt: s.submitted_at,
            late: Boolean(s.late),
            missing: Boolean(s.missing),
            teacherComment: s.submission_comments?.at(-1)?.comment ?? null,
          })),
      })),
    });
  }
  return out;
}

export function readSampleCanvas(allowlist: Set<string>): CanvasCourseRecord[] {
  const file = path.join(process.cwd(), "fixtures/sample/canvas-courses.json");
  const { courses } = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    courses: {
      id: string;
      name: string;
      teacher: string;
      submissions: {
        user_id: string;
        assignment: string;
        submitted_at: string | null;
        late: boolean;
        missing: boolean;
        comment: string | null;
      }[];
    }[];
  };
  return courses
    .map((c) => {
      const present = [...new Set(c.submissions.map((s) => s.user_id))].filter((id) => allowlist.has(id));
      return {
        canvasCourseId: c.id,
        courseName: c.name,
        teacherName: c.teacher,
        students: present.map((externalId) => ({
          externalId,
          evidence: c.submissions
            .filter((s) => s.user_id === externalId)
            .map((s) => ({
              assignmentName: s.assignment,
              submittedAt: s.submitted_at,
              late: s.late,
              missing: s.missing,
              teacherComment: s.comment,
            })),
        })),
      };
    })
    .filter((c) => c.students.length);
}
