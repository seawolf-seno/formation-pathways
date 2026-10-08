/** Exactly what a draft would send to the AI, names removed (lib/sor/anonymize.ts). */
export function SentToAi({ text, leaks }: { text: string; leaks: number }) {
  return (
    <details className="rounded-lg border border-[var(--color-border)] bg-white text-sm">
      <summary className="cursor-pointer px-4 py-2 font-medium text-[var(--color-navy-ink)]">
        What the AI sees <span className="font-normal text-[var(--color-ink-muted)]">(names removed)</span>
      </summary>
      <div className="space-y-2 border-t border-[var(--color-border)] px-4 py-3">
        <p className="text-xs text-[var(--color-ink-muted)]">
          This is the exact text a draft sends, before public podcast notes are added. Names we know (the student, family,
          every student on the roster, staff in the record) become placeholders like [STUDENT] and are put back when the draft
          returns. A name we don&apos;t have, like a sibling or a friend at another school, can&apos;t be caught: check for one here.
        </p>
        {leaks > 0 && (
          <p className="text-xs font-semibold text-[var(--color-navy-ink)]">
            {leaks} known {leaks === 1 ? "name is" : "names are"} still in this text, so drafting will stop before sending anything.
          </p>
        )}
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-cream,#f8f5ed)] p-3 font-mono text-xs leading-relaxed">{text}</pre>
      </div>
    </details>
  );
}
