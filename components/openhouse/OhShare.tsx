"use client";

import { useState } from "react";
import { shareOpenHouseAction } from "@/lib/openhouse-actions";

/**
 * One Share button. The first time, one tap confirms a parent or guardian is
 * sharing (nothing is public before that). Then the phone's own share sheet,
 * with the card image, the key text and the family's invite link; on a
 * computer, copy the link or save the image.
 */
export function OhShare({
  token,
  firstName,
  shared,
  keyText,
  waiver,
  origin,
}: {
  token: string;
  firstName: string;
  shared: boolean;
  keyText: string;
  waiver: string | null;
  origin: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const message = (url: string) =>
    [`${firstName}'s Formation Pathway at Pacifica Christian.`, keyText, waiver ? `(If you apply through our link, Pacifica gives our family: ${waiver}.)` : null, url]
      .filter(Boolean)
      .join("\n");

  async function share(confirmed: boolean) {
    if (!shared && !code && !confirmed) return setConfirming(true);
    setBusy(true);
    setNote(null);
    let c = code;
    if (!c) {
      const res = await shareOpenHouseAction(token);
      if (!res.ok) {
        setBusy(false);
        return setNote(res.error);
      }
      c = res.code;
      setCode(c);
    }
    setConfirming(false);
    const url = `${origin}/oh?ref=${c}`;
    try {
      const blob = await fetch(`/oh/${token}/card`).then((r) => r.blob());
      const file = new File([blob], `${firstName}-pathway.png`, { type: "image/png" });
      const data: ShareData = { text: message(url), files: [file] };
      if (navigator.canShare?.(data)) await navigator.share(data);
      else if (navigator.share) await navigator.share({ text: message(url), url });
      else {
        await navigator.clipboard.writeText(message(url));
        setNote("Copied. Paste it in a text, email or post.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        await navigator.clipboard?.writeText(message(url)).catch(() => {});
        setNote("Copied. Paste it in a text, email or post.");
      }
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {confirming ? (
        <button onClick={() => share(true)} disabled={busy} className="w-full rounded-2xl bg-[var(--color-gold)] py-4 text-lg font-semibold text-[var(--color-navy-ink)]">
          I&apos;m {firstName}&apos;s parent or guardian. Share it.
        </button>
      ) : (
        <button onClick={() => share(false)} disabled={busy} className="w-full rounded-2xl bg-[var(--color-navy)] py-4 text-lg font-semibold text-white">
          {busy ? "Opening…" : "Share with friends"}
        </button>
      )}
      <a href={`/oh/${token}/card?download`} className="block text-center text-sm text-[var(--color-navy)] underline">
        Save the image
      </a>
      {note && <p className="text-center text-sm text-[var(--color-ink-muted)]">{note}</p>}
    </div>
  );
}
