export function StaleIndicator() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-gold-light)] px-2.5 py-1 text-xs font-medium text-[var(--color-navy-ink)]"
      title="No one has logged a moment with this student in a while — might be worth a look."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gold)]" />
      needs someone to move toward them
    </span>
  );
}
