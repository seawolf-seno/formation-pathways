import type { Level } from "@/lib/mastery/config";

// How each level looks. No red and no "failing" state (product principle 2):
// a start is pale sand, then deepening Pacific blue, then navy with gold.
// Every chip also carries its word (or initial), so colour is never the only
// signal.
export const LEVEL_STYLE: Record<Level | "none", { chip: string; cell: string; initial: string }> = {
  none: { chip: "border border-dashed border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]", cell: "bg-white text-[var(--color-ink-muted)]", initial: "·" },
  beginning: { chip: "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]", cell: "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]", initial: "B" },
  developing: { chip: "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)] ring-1 ring-[var(--color-pacific)]", cell: "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]", initial: "D" },
  proficient: { chip: "bg-[var(--color-pacific)] text-[var(--color-navy-ink)]", cell: "bg-[var(--color-pacific)] text-[var(--color-navy-ink)]", initial: "P" },
  extending: { chip: "bg-[var(--color-navy)] text-white ring-2 ring-[var(--color-gold)]", cell: "bg-[var(--color-navy)] text-white", initial: "E" },
};

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
