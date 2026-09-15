"use client";

import { useState } from "react";
import { signPortraitAction, updatePortraitContentAction } from "@/lib/actions";
import type { Portrait } from "@/lib/types";

export function PortraitEditor({
  portrait: initialPortrait,
  onClose,
  onUpdate,
}: {
  portrait: Portrait;
  onClose: () => void;
  onUpdate?: (portrait: Portrait) => void;
}) {
  const [portrait, setPortrait] = useState(initialPortrait);
  const [content, setContent] = useState(initialPortrait.content);
  const [signedBy, setSignedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  const isSigned = Boolean(portrait.signed_by);
  const isAdmissions = portrait.type === "admissions";

  async function handleSaveEdits() {
    setSaving(true);
    try {
      const updated = await updatePortraitContentAction(portrait.id, content);
      setPortrait(updated);
      onUpdate?.(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleSign() {
    if (!signedBy.trim()) return;
    setSigning(true);
    try {
      if (content !== portrait.content) {
        await updatePortraitContentAction(portrait.id, content);
      }
      const signed = await signPortraitAction(portrait.id, signedBy);
      setPortrait(signed);
      onUpdate?.(signed);
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
            {isAdmissions ? "Admissions story" : "Pathway Portrait"}
          </p>
          {isAdmissions && (
            <p className="text-xs text-[var(--color-gold)]">
              Fictional demo data — real stories require written family permission.
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="relative p-5">
        {!isSigned && (
          <span className="pointer-events-none absolute right-6 top-2 select-none text-3xl font-bold tracking-widest text-[var(--color-gold)] opacity-30">
            DRAFT
          </span>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={isSigned}
          rows={14}
          className={`w-full rounded-lg border p-3 text-sm leading-relaxed focus:outline-none ${
            isSigned
              ? "border-transparent bg-[var(--color-canvas)] text-[var(--color-ink)]"
              : "border-[var(--color-border)] focus:border-[var(--color-pacific)]"
          }`}
        />

        {isSigned ? (
          <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
            Reviewed and signed by{" "}
            <span className="font-medium text-[var(--color-navy-ink)]">
              {portrait.signed_by}
            </span>{" "}
            on {new Date(portrait.signed_at as string).toLocaleDateString()}.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdits}
                disabled={saving || content === portrait.content}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink-muted)] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save edits"}
              </button>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-canvas)] p-3 sm:flex-row sm:items-center">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                Reviewed and signed by
              </label>
              <input
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
              />
              <button
                onClick={handleSign}
                disabled={signing || !signedBy.trim()}
                className="rounded-lg bg-[var(--color-gold)] px-4 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-40"
              >
                {signing ? "Signing…" : "Sign"}
              </button>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Unsigned drafts are watermarked and never sent anywhere. Signing confirms a named adult reviewed this.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
