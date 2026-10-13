import { SOURCE_LABELS, levelLabel, type EvidenceSource, type Level, type MasteryConfig, type Standard } from "@/lib/mastery/config";
import { levelFromScore, standardLevel } from "@/lib/mastery/rules";
import type { Evidence, KhanLevelRow, KhanSkillRow, ObjectiveGradeRow } from "@/lib/mastery/queries";
import { LEVEL_STYLE, shortDate } from "./levels";
import { DeleteEvidenceButton } from "./TeacherTools";

/** Khan's level words, nicest first, and how they look. */
const KHAN_ORDER = ["mastered", "proficient", "familiar", "attempted"];
const KHAN_STYLE: Record<string, string> = {
  mastered: "bg-[var(--color-navy)] text-white",
  proficient: "bg-[var(--color-pacific)] text-[var(--color-navy-ink)]",
  familiar: "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]",
  attempted: "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]",
};
const khanWord = (w: string | null) => (w ? w[0].toUpperCase() + w.slice(1).replace(/[_-]/g, " ") : "Not started");

/** The level an objective shows: Canvas's own score if there is one (it's
 *  the grade), otherwise what the evidence adds up to. */
export function objectiveLevel(config: MasteryConfig, grade: ObjectiveGradeRow | null | undefined, evidence: Evidence[]): Level | null {
  if (grade && grade.max_score) return levelFromScore(grade.score, grade.max_score, config.rules);
  return standardLevel(evidence, config.rules).level;
}

const result = (e: Evidence, config: MasteryConfig) =>
  e.level ? levelLabel(config, e.level) : e.score !== null && e.max_score !== null ? `${Number(e.score.toFixed(2))} / ${Number(e.max_score.toFixed(2))}` : "";

/**
 * One learning objective for one student: the Canvas score first, then what
 * the evidence says, and a dropdown of everything behind it, by source.
 */
export function ObjectiveCard({
  config,
  standard,
  evidence,
  grade,
  khanSkills = [],
  khanLevels = [],
  courseIdForTeacher,
  open = false,
}: {
  config: MasteryConfig;
  standard: Standard;
  evidence: Evidence[];
  grade?: ObjectiveGradeRow | null;
  /** Khan skills sorted into this objective. */
  khanSkills?: KhanSkillRow[];
  /** This student's Khan levels (any skill; matched here). */
  khanLevels?: KhanLevelRow[];
  courseIdForTeacher?: string;
  open?: boolean;
}) {
  const fromEvidence = standardLevel(evidence, config.rules);
  const shown = objectiveLevel(config, grade, evidence);
  const levelOf = new Map(khanLevels.map((k) => [k.skill_id, k.level]));
  const khan = khanSkills
    .map((s) => ({ title: s.title, level: levelOf.get(s.skill_id) ?? null }))
    .sort((a, b) => {
      const ia = a.level ? KHAN_ORDER.indexOf(a.level) : 99;
      const ib = b.level ? KHAN_ORDER.indexOf(b.level) : 99;
      return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib) || a.title.localeCompare(b.title);
    });
  const khanDone = khan.filter((k) => k.level === "mastered" || k.level === "proficient").length;
  const bySource = new Map<EvidenceSource, Evidence[]>();
  for (const e of evidence) if (e.source !== "khan") bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  const count = khan.length + evidence.filter((e) => e.source !== "khan").length;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--color-navy-ink)]">{standard.title}</p>
          {standard.description && <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{standard.description}</p>}
        </div>
        <div className="text-right">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${LEVEL_STYLE[shown ?? "none"].chip}`}>{levelLabel(config, shown)}</span>
          <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
            {grade
              ? `Canvas: ${grade.label ?? ""}${grade.label ? " · " : ""}${Number(grade.score.toFixed(2))}${grade.max_score ? `/${grade.max_score}` : ""}`
              : "Not graded in Canvas yet"}
            {grade && fromEvidence.level && fromEvidence.level !== shown ? ` · evidence says ${levelLabel(config, fromEvidence.level)}` : ""}
            {!grade && fromEvidence.level ? " · from evidence" : ""}
          </p>
          {khan.length > 0 && (
            <p className="text-[11px] text-[var(--color-ink-muted)]">
              Khan: {khanDone} of {khan.length} skill{khan.length === 1 ? "" : "s"} proficient or mastered
            </p>
          )}
        </div>
      </div>
      <details open={open} className="border-t border-[var(--color-border)]">
        <summary className="cursor-pointer px-4 py-2 text-xs text-[var(--color-navy)]">What&apos;s behind it ({count})</summary>
        <div className="space-y-3 px-4 pb-4">
          {count === 0 && <p className="text-xs text-[var(--color-ink-muted)]">Nothing yet.</p>}
          {khan.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Khan Academy</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {khan.map((k) => (
                  <li key={k.title} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-canvas)] px-2 py-1 text-xs">
                    <span className="min-w-0 truncate" title={k.title}>
                      {k.title}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${KHAN_STYLE[k.level ?? ""] ?? "border border-dashed border-[var(--color-border)] text-[var(--color-ink-muted)]"}`}>
                      {khanWord(k.level)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {[...bySource.entries()].map(([source, pieces]) => (
            <div key={source}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">{SOURCE_LABELS[source]}</p>
              <ul className="space-y-1">
                {pieces.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-[var(--color-canvas)] px-2 py-1 text-xs">
                    <span className="min-w-0 flex-1">
                      {e.title}
                      {e.note && <span className="block text-[var(--color-ink-muted)]">“{e.note}”</span>}
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer" className="block truncate text-[var(--color-navy)] underline">
                          {e.link}
                        </a>
                      )}
                    </span>
                    <span className="whitespace-nowrap">
                      {result(e, config)} <span className="text-[var(--color-ink-muted)]">· {shortDate(e.occurred_at)}</span>
                    </span>
                    {courseIdForTeacher && <DeleteEvidenceButton courseId={courseIdForTeacher} evidenceId={e.id} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
