import type { Course, CourseSkill, SkillSnapshot } from "@/lib/types";

export function StudentSkills({
  courses,
  skillsByCourse,
  snapshots,
}: {
  courses: Course[];
  skillsByCourse: Map<number, CourseSkill[]>;
  snapshots: SkillSnapshot[];
}) {
  if (courses.length === 0) return null;

  return (
    <div className="space-y-4">
      {courses.map((course) => {
        const skills = skillsByCourse.get(course.id) ?? [];
        const rows = skills
          .map((skill) => ({
            skill,
            snapshot: snapshots.find((s) => s.skill_id === skill.id),
          }))
          .filter((r) => r.snapshot);

        if (rows.length === 0) return null;

        return (
          <div
            key={course.id}
            className="rounded-xl border border-[var(--color-border)] bg-white p-4"
          >
            <h3 className="font-display text-base text-[var(--color-navy-ink)]">
              Where they are in {course.name}
            </h3>
            <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
              {course.teacher_name}
            </p>
            <dl className="space-y-3">
              {rows.map(({ skill, snapshot }) => (
                <div key={skill.id}>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                    {skill.name}
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {snapshot!.narrative}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
