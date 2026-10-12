import Link from "next/link";
import { levelLabel, type Level, type MasteryConfig } from "@/lib/mastery/config";
import { groupLevel, studentStatuses } from "@/lib/mastery/rules";
import type { Evidence, RosterStudent } from "@/lib/mastery/queries";
import { LEVEL_STYLE } from "./levels";

/**
 * The teacher's view of the whole class: a row per student, a column per
 * unit (or per topic, inside one unit). Each cell is the level word's
 * initial on its colour, and links to that student. Counts per column show
 * where the class as a whole is.
 */
export function ClassMap({
  courseSlug,
  config,
  roster,
  evidence,
  unit,
}: {
  courseSlug: string;
  config: MasteryConfig;
  roster: RosterStudent[];
  evidence: Evidence[];
  /** A group code to show its standards, or null for units. */
  unit: string | null;
}) {
  const group = unit ? config.groups.find((g) => g.code === unit) ?? null : null;
  const columns = group
    ? group.standards.map((s) => ({ key: s.code, label: s.code, title: s.title }))
    : config.groups.map((g) => ({ key: g.code, label: g.code, title: g.title }));
  const rows = roster.map((s) => {
    const statuses = studentStatuses(config, evidence.filter((e) => e.person_id === s.id));
    const cells: (Level | null)[] = group
      ? group.standards.map((st) => statuses.get(st.code)?.level ?? null)
      : config.groups.map((g) => groupLevel(g.standards.map((st) => statuses.get(st.code)?.level ?? null)));
    return { student: s, cells };
  });
  const atLeastProficient = columns.map((_, i) => rows.filter((r) => r.cells[i] === "proficient" || r.cells[i] === "extending").length);

  return (
    <div>
      <nav className="mb-3 flex flex-wrap gap-1.5 text-xs" aria-label="Units">
        <Link href={`/mastery/${courseSlug}`} className={`rounded-full px-3 py-1 ${!group ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)] bg-white"}`}>
          All units
        </Link>
        {config.groups.map((g) => (
          <Link
            key={g.code}
            href={`/mastery/${courseSlug}?unit=${g.code}`}
            className={`rounded-full px-3 py-1 ${group?.code === g.code ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)] bg-white"}`}
          >
            {g.code}
          </Link>
        ))}
      </nav>
      {group && <p className="mb-2 text-sm text-[var(--color-ink-muted)]">{group.title}</p>}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-ink-muted)]">
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium">Student</th>
              {columns.map((c) => (
                <th key={c.key} title={c.title} className="px-1 py-2 text-center font-medium">
                  {group ? c.label : <Link href={`/mastery/${courseSlug}?unit=${c.key}`} className="underline decoration-dotted">{c.label}</Link>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, cells }) => (
              <tr key={student.id} className="border-t border-[var(--color-border)]">
                <th className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-normal">
                  <Link href={`/mastery/${courseSlug}/students/${student.id}`} className="text-[var(--color-navy)] hover:underline">
                    {student.preferred_name || student.first_name} {student.last_name}
                  </Link>
                </th>
                {cells.map((level, i) => (
                  <td key={columns[i].key} className="px-1 py-1.5 text-center">
                    <Link
                      href={`/mastery/${courseSlug}/students/${student.id}`}
                      title={`${columns[i].title}: ${levelLabel(config, level)}`}
                      className={`mx-auto flex h-8 w-10 items-center justify-center rounded-md text-xs font-semibold ${LEVEL_STYLE[level ?? "none"].cell}`}
                    >
                      {LEVEL_STYLE[level ?? "none"].initial}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length + 1} className="p-4 text-[var(--color-ink-muted)]">
                  Add students below to see the class here.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-[var(--color-border)] text-xs text-[var(--color-ink-muted)]">
                <th className="sticky left-0 bg-white px-3 py-2 text-left font-normal">Proficient or beyond</th>
                {atLeastProficient.map((n, i) => (
                  <td key={columns[i].key} className="py-2 text-center">
                    {n}/{rows.length}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
        {config.scale.map((s) => `${LEVEL_STYLE[s.level].initial} ${s.label}`).join(" · ")} · · Not started
      </p>
    </div>
  );
}
