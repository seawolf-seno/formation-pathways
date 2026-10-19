"use client";

import { useState, useTransition } from "react";
import { suggestClassResourceAction } from "@/lib/sor/actions";
import { suggestMyClassResourceAction } from "@/lib/sor/student-actions";
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH, SUGGESTION_KINDS } from "@/lib/sor/class-resources";
import type { ResourceKind } from "@/lib/sor/study-library";

const field = "mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]";
const label = "block text-xs font-semibold text-[var(--color-navy-ink)]";

/**
 * "Add something that helped you": a student suggests a link for one of
 * their classes. It is saved unreviewed, as the signed-in adult (or, with
 * `self`, as the signed-in student), and shows to others taking the class
 * only after a teacher approves it.
 */
export function SuggestResource({ personId, classKey, classTitle, self }: { personId: string; classKey: string; classTitle: string; self?: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<ResourceKind>(SUGGESTION_KINDS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  // One id base per class, so labels reach the right field with many forms on the page.
  const id = `suggest-${classKey.replace(/[^a-z0-9]/gi, "-")}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const suggestion = { classKey, title, url, kind, note };
      const res = self ? await suggestMyClassResourceAction(suggestion) : await suggestClassResourceAction({ personId, suggestion });
      if (!res.ok) return setError(res.error);
      setSent(true);
      setOpen(false);
      setTitle("");
      setUrl("");
      setNote("");
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setOpen(true); setSent(false); }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] hover:border-[var(--color-pacific)]"
        >
          {sent ? "Add another" : "Add something that helped you"}
        </button>
        {sent && (
          <p role="status" className="text-sm text-[var(--color-navy-ink)]">
            Thanks. A teacher will look at it before it shows up for your class.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-[var(--color-canvas)] p-4">
      <p className="font-display text-base text-[var(--color-navy-ink)]">What helped you with {classTitle}?</p>
      <div>
        <label htmlFor={`${id}-url`} className={label}>The link</label>
        <input
          id={`${id}-url`}
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={MAX_URL_LENGTH}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://…"
          required
        />
      </div>
      <div>
        <label htmlFor={`${id}-title`} className={label}>What is it?</label>
        <input
          id={`${id}-title`}
          className={field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="e.g. A video that finally made buffers make sense"
          required
        />
      </div>
      <fieldset>
        <legend className={label}>What kind of thing?</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SUGGESTION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                kind === k
                  ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                  : "border-[var(--color-border)] bg-white text-[var(--color-navy-ink)]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className={label}>Why did it help? <span className="font-normal text-[var(--color-ink-muted)]">(optional)</span></label>
        <textarea id={`${id}-note`} className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LENGTH} />
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Shown without your name.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-[var(--color-gold-light)] px-3 py-2 text-sm text-[var(--color-navy-ink)]">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="px-3 py-2 text-sm text-[var(--color-ink-muted)] hover:underline">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Sending…" : "Send to a teacher"}
        </button>
      </div>
    </form>
  );
}
