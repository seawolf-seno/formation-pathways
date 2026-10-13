import { LEVELS, levelLabel, videoUrl, type MasteryConfig } from "@/lib/mastery/config";
import { groupLevel, levelCounts, nextSteps, studentStatuses, type StandardStatus } from "@/lib/mastery/rules";
import type { Evidence, KhanLevelRow, KhanSkillRow, ObjectiveGradeRow } from "@/lib/mastery/queries";
import { ObjectiveCard, objectiveLevel } from "./ObjectiveCard";
import { LEVEL_STYLE } from "./levels";

const RESOURCE_ICON: Record<string, string> = { khan: "Practice", phet: "Simulation", openstax: "Reading", ap_classroom: "AP practice", other: "Link" };

export function LevelChip({ config, level, size = "sm" }: { config: MasteryConfig; level: StandardStatus["level"]; size?: "sm" | "lg" }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full font-medium ${size === "lg" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"} ${LEVEL_STYLE[level ?? "none"].chip}`}>
      {levelLabel(config, level)}
    </span>
  );
}



/**
 * One student's mastery in a course: where they are on each standard (in
 * words), why (every piece of evidence, with its source and score), and what
 * to do next (with the links to do it). The same screen for the student
 * (audience "student", addressed as "you") and their teacher.
 */
export function MasteryView({
  config,
  evidence,
  firstName,
  audience,
  courseIdForTeacher,
  finishedThrough = null,
  grades = [],
  khanSkills = [],
  khanLevels = [],
}: {
  config: MasteryConfig;
  evidence: Evidence[];
  firstName: string;
  audience: "student" | "teacher";
  /** The last unit the class has finished: those come first in next steps. */
  finishedThrough?: number | null;
  /** Canvas's own objective scores for this student. */
  grades?: ObjectiveGradeRow[];
  /** Khan skills sorted into objectives, and this student's Khan levels. */
  khanSkills?: KhanSkillRow[];
  khanLevels?: KhanLevelRow[];
  /** Set on the teacher's copy: shows a remove button on each piece. */
  courseIdForTeacher?: string;
}) {
  const you = audience === "student";
  const statuses = studentStatuses(config, evidence);
  const gradeOf = (code: string) => grades.find((g) => g.standard_code === code) ?? null;
  const counts = levelCounts(
    [...statuses.values()].map((st) => ({ ...st, level: objectiveLevel(config, gradeOf(st.code), evidence.filter((e) => e.standard_code === st.code)) })),
  );
  const steps = nextSteps(config, statuses, evidence, 3, finishedThrough);
  const total = statuses.size;
  const atOrAbove = counts.proficient + counts.extending;
  const byStandard = new Map<string, Evidence[]>();
  for (const e of evidence) byStandard.set(e.standard_code, [...(byStandard.get(e.standard_code) ?? []), e]);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {atOrAbove
            ? `${you ? "You're" : `${firstName} is`} proficient or beyond on ${atOrAbove} of ${total} standards.`
            : `${you ? "Your" : `${firstName}'s`} first evidence shows up here as it comes in.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <span key={l} className={`rounded-full px-3 py-1 text-xs font-medium ${LEVEL_STYLE[l].chip}`}>
              {levelLabel(config, l)} · {counts[l]}
            </span>
          ))}
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${LEVEL_STYLE.none.chip}`}>Not started · {counts.none}</span>
        </div>
        <details className="mt-3 text-xs text-[var(--color-ink-muted)]">
          <summary className="cursor-pointer">What the levels mean</summary>
          <ul className="mt-2 space-y-1">
            {config.scale.map((s) => (
              <li key={s.level}>
                <strong className="text-[var(--color-ink)]">{s.label}:</strong> {s.meaning}
              </li>
            ))}
            <li>
              A level comes from the newest few pieces of evidence, with oral exams and AP-style work counting most. When
              {you ? " your teacher" : " you"} set{you ? "s" : ""} a level after an oral exam, that stands until newer
              evidence comes in.
            </li>
          </ul>
        </details>
      </section>

      {steps.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-[var(--color-navy-ink)]">{you ? "Your next steps" : "Next steps"}</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.standard.code} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">{s.standard.code}</p>
                  <LevelChip config={config} level={s.level} />
                </div>
                <p className="mt-1 font-medium text-[var(--color-navy-ink)]">{s.standard.title}</p>
                {s.covered && <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">Covered in class already</p>}
                {s.readyToShow && (
                  <p className="mt-2 rounded-lg bg-[var(--color-gold-light)] px-2 py-1 text-xs text-[var(--color-navy-ink)]">
                    {you ? "Your newest work already shows it. Ask for an oral exam to confirm it." : "Newest work already shows it: an oral exam could confirm it."}
                  </p>
                )}
                <ul className="mt-3 space-y-1.5 text-sm">
                  {s.videos.slice(0, 1).map((v) => (
                    <li key={v.id}>
                      <a href={videoUrl(v.id)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline decoration-[var(--color-pacific)] underline-offset-2">
                        {v.title}
                      </a>
                      <span className="ml-1 text-xs text-[var(--color-ink-muted)]">(Video · {v.channel})</span>
                    </li>
                  ))}
                  {s.resources.slice(0, 4).map((r) => (
                    <li key={r.url + r.label}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline decoration-[var(--color-pacific)] underline-offset-2">
                        {r.label}
                      </a>
                      <span className="ml-1 text-xs text-[var(--color-ink-muted)]">({RESOURCE_ICON[r.kind]})</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl text-[var(--color-navy-ink)]">By unit</h2>
        <div className="mt-3 space-y-2">
          {config.groups.map((g, gi) => {
            const levels = g.standards.map((s) => objectiveLevel(config, gradeOf(s.code), byStandard.get(s.code) ?? []));
            const started = levels.some(Boolean);
            return (
              <details key={g.code} open={started && gi < 3} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                  <span className="font-medium text-[var(--color-navy-ink)]">{g.title}</span>
                  <LevelChip config={config} level={groupLevel(levels)} />
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {g.standards.map((s) => (
                    <ObjectiveCard
                      key={s.code}
                      config={config}
                      standard={s}
                      evidence={byStandard.get(s.code) ?? []}
                      grade={gradeOf(s.code)}
                      khanSkills={khanSkills.filter((k) => k.standard_code === s.code)}
                      khanLevels={khanLevels}
                      courseIdForTeacher={courseIdForTeacher}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
