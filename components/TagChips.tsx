import type { FormationTag } from "@/lib/types";

const TAG_STYLES: Record<FormationTag, string> = {
  "Spiritual Depth": "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]",
  "Intellectual Courage": "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]",
  "Character Under Pressure": "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]",
  "Love of Neighbor": "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]",
  "Emerging Superpowers": "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]",
  "Sense of Calling": "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]",
};

export function TagChip({ tag }: { tag: FormationTag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TAG_STYLES[tag]}`}
    >
      {tag}
    </span>
  );
}

export function TagCountChips({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">
        No formation tags yet.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([tag, count]) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            TAG_STYLES[tag as FormationTag] ?? "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]"
          }`}
        >
          {tag}
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold">
            {count}
          </span>
        </span>
      ))}
    </div>
  );
}
