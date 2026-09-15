import type { Observation } from "@/lib/types";
import { dateLabel, groupByMonth } from "@/lib/format";
import { TagChip } from "./TagChips";

export function Timeline({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-ink-muted)]">
        No moments captured yet. The first one is one tap away.
      </p>
    );
  }

  const groups = groupByMonth(observations);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
            {group.label}
          </h3>
          <ul className="space-y-3">
            {group.items.map((obs) => (
              <li
                key={obs.id}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--color-navy-ink)]">
                    {obs.author}
                  </span>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {dateLabel(obs.created_at)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-ink)]">
                  {obs.clean_text}
                </p>
                {obs.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {obs.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
