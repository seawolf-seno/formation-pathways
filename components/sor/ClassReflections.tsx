"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDictation } from "@/components/useDictation";
import { saveClassReflectionsAction } from "@/lib/sor/actions";
import { MAX_LIKED, MAX_NOTE_LENGTH, type ClassReflection, type ReflectionClass } from "@/lib/sor/class-reflections";
import type { SparkOption } from "@/lib/spark";

type Enjoy = "like" | "love";
type Step = { kind: "pick" } | { kind: "why"; index: number } | { kind: "done" };
type Save = "idle" | "saving" | "saved" | { error: string };
type Why = { liked: string[]; note: string; via: "voice" | "text" };

const EMPTY: Why = { liked: [], note: "", via: "text" };
const primary = "rounded-lg bg-[var(--color-navy)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40";
const quiet = "rounded-lg px-4 py-2.5 text-sm text-[var(--color-ink-muted)] underline-offset-2 hover:underline";

/**
 * Class reflections, explored in person on a staff member's device: tap the
 * classes you enjoy (again for the ones you love), then say what makes each
 * one good. Saved once, on reaching the end. No scores, and an untapped class
 * is never sent anywhere.
 */
export function ClassReflections({
  personId,
  firstName,
  classes,
  likes,
  isSample,
}: {
  personId: string;
  firstName: string;
  classes: ReflectionClass[];
  likes: SparkOption[];
  isSample: boolean;
}) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [picks, setPicks] = useState<Record<string, Enjoy>>({});
  const [whys, setWhys] = useState<Record<string, Why>>({});
  const [save, setSave] = useState<Save>("idle");
  const chosen = classes.filter((c) => picks[c.key]);

  // Warn before closing once there's something that isn't saved yet.
  const unsaved = chosen.length > 0 && save !== "saved";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /** Not picked → like → love → not picked. */
  function tap(key: string) {
    setPicks((p) => {
      const next = { ...p };
      if (!p[key]) next[key] = "like";
      else if (p[key] === "like") next[key] = "love";
      else delete next[key];
      return next;
    });
  }

  async function finish(latest: Record<string, Why>) {
    setStep({ kind: "done" });
    setSave("saving");
    const reflections: { classes: ClassReflection[] } = {
      classes: chosen.map((c) => ({
        key: c.key,
        title: c.title,
        schoolYear: c.schoolYear,
        loved: picks[c.key] === "love",
        ...(latest[c.key] ?? EMPTY),
      })),
    };
    const res = await saveClassReflectionsAction({ personId, reflections });
    setSave(res.ok ? "saved" : { error: res.error });
  }

  function answer(index: number, why: Why | null) {
    const next = why ? { ...whys, [chosen[index].key]: why } : whys;
    setWhys(next);
    if (index + 1 < chosen.length) setStep({ kind: "why", index: index + 1 });
    else finish(next);
  }

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">Your classes</p>
          {isSample && (
            <span className="rounded bg-[var(--color-gold-light)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
              Fictional sample
            </span>
          )}
        </div>

        {step.kind === "pick" && (
          <section>
            <h1 className="font-display text-3xl leading-tight text-[var(--color-navy-ink)]">
              {firstName}, which classes do you actually enjoy?
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Tap the ones you like. Tap again for the ones you love. Leave the rest; nothing is saved about a class you skip.
            </p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {classes.map((c) => {
                const pick = picks[c.key];
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => tap(c.key)}
                      aria-pressed={Boolean(pick)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        pick === "love"
                          ? "border-[var(--color-gold)] bg-[var(--color-gold-light)]"
                          : pick === "like"
                            ? "border-[var(--color-pacific)] bg-[var(--color-pacific-light)]"
                            : "border-[var(--color-border)] bg-white hover:border-[var(--color-pacific)]"
                      }`}
                    >
                      <span>
                        <span className="block font-medium text-[var(--color-navy-ink)]">{c.title}</span>
                        {c.offeringType && <span className="block text-xs text-[var(--color-ink-muted)]">{c.offeringType}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-[var(--color-navy-ink)]">
                        {pick === "love" ? "Love it ✦" : pick === "like" ? "Like it" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-end">
              <button type="button" className={primary} disabled={!chosen.length} onClick={() => setStep({ kind: "why", index: 0 })}>
                Next
              </button>
            </div>
          </section>
        )}

        {step.kind === "why" && (
          <WhyStep
            // Keyed so each class starts with its own answer, not the last one's.
            key={chosen[step.index].key}
            title={chosen[step.index].title}
            loved={picks[chosen[step.index].key] === "love"}
            position={`${step.index + 1} of ${chosen.length}`}
            likes={likes}
            initial={whys[chosen[step.index].key] ?? EMPTY}
            onBack={() => setStep(step.index === 0 ? { kind: "pick" } : { kind: "why", index: step.index - 1 })}
            onNext={(why) => answer(step.index, why)}
          />
        )}

        {step.kind === "done" && (
          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center sm:p-10">
            <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">Thanks, {firstName}.</h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Your teachers will use what you said about {chosen.length === 1 ? "this class" : `these ${chosen.length} classes`} when they think with you about what comes next.
            </p>
            <ul className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-1.5">
              {chosen.map((c) => (
                <li
                  key={c.key}
                  className={`rounded-full px-3 py-1 text-xs text-[var(--color-navy-ink)] ${picks[c.key] === "love" ? "bg-[var(--color-gold-light)]" : "bg-[var(--color-pacific-light)]"}`}
                >
                  {c.title}
                  {picks[c.key] === "love" ? " ✦" : ""}
                </li>
              ))}
            </ul>
            <div className="mt-6 text-sm" role="status">
              {save === "saving" && <p className="text-[var(--color-ink-muted)]">Saving…</p>}
              {save === "saved" && (
                <p className="text-[var(--color-navy-ink)]">
                  Saved.{" "}
                  <Link href={`/pathway/${personId}/study`} className="font-semibold underline">Back to your classes →</Link>
                  <Link href={`/pilot/people/${personId}#classes`} className="ml-3 text-xs text-[var(--color-ink-muted)] underline">staff page</Link>
                </p>
              )}
              {typeof save === "object" && (
                <div className="space-y-3">
                  <p className="rounded-lg bg-[var(--color-gold-light)] px-3 py-2 text-[var(--color-navy-ink)]">Not saved yet: {save.error}</p>
                  <button type="button" className={primary} onClick={() => finish(whys)}>Try again</button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function WhyStep({
  title,
  loved,
  position,
  likes,
  initial,
  onBack,
  onNext,
}: {
  title: string;
  loved: boolean;
  position: string;
  likes: SparkOption[];
  initial: Why;
  onBack: () => void;
  onNext: (why: Why | null) => void;
}) {
  const [liked, setLiked] = useState<string[]>(initial.liked);
  const [note, setNote] = useState(initial.note);
  const [usedVoice, setUsedVoice] = useState(initial.via === "voice");
  const dictation = useDictation(setNote);
  const full = liked.length >= MAX_LIKED;

  function toggle(label: string) {
    setLiked((l) => (l.includes(label) ? l.filter((x) => x !== label) : l.length < MAX_LIKED ? [...l, label] : l));
  }
  function toggleMic() {
    if (dictation.listening) dictation.stop();
    else {
      setUsedVoice(true);
      dictation.start(note);
    }
  }
  function next() {
    const text = (dictation.listening ? dictation.stop() : note).trim().slice(0, MAX_NOTE_LENGTH);
    onNext({ liked, note: text, via: usedVoice && text ? "voice" : "text" });
  }

  return (
    <section>
      <p className="text-xs text-[var(--color-ink-muted)]">{position}</p>
      <h1 className="mt-1 font-display text-3xl leading-tight text-[var(--color-navy-ink)]">
        What makes {title} {loved ? "one you love" : "good"}?
      </h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Tap anything that&apos;s true for you.</p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {likes.map((o) => {
          const on = liked.includes(o.label);
          return (
            <li key={o.label}>
              <button
                type="button"
                onClick={() => toggle(o.label)}
                aria-pressed={on}
                disabled={!on && full}
                className={`rounded-full border px-3.5 py-2 text-sm transition-colors disabled:opacity-40 ${
                  on
                    ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                    : "border-[var(--color-border)] bg-white text-[var(--color-navy-ink)] hover:border-[var(--color-pacific)]"
                }`}
              >
                {o.emoji && <span aria-hidden="true">{o.emoji} </span>}
                {o.label}
              </button>
            </li>
          );
        })}
      </ul>

      <label htmlFor="class-note" className="mt-7 block font-display text-lg text-[var(--color-navy-ink)]">
        What&apos;s one thing from this class you&apos;d keep doing even if it wasn&apos;t assigned?
      </label>
      <div className="mt-2 flex items-start gap-2">
        <textarea
          id="class-note"
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          value={dictation.interim ? `${note} ${dictation.interim}` : note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={dictation.supported ? "Tap the mic and just say it, or type…" : "Type…"}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm text-[var(--color-ink)]"
        />
        {dictation.supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={dictation.listening ? "Stop listening" : "Answer out loud"}
            className={`shrink-0 rounded-full border px-3 py-2 text-lg ${dictation.listening ? "border-[var(--color-gold)] bg-[var(--color-gold-light)]" : "border-[var(--color-border)] bg-white"}`}
          >
            <span aria-hidden="true">{dictation.listening ? "■" : "🎙"}</span>
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className={quiet} onClick={onBack}>Back</button>
        <div className="flex items-center gap-1">
          <button type="button" className={quiet} onClick={() => onNext(null)}>Skip</button>
          <button type="button" className={primary} onClick={next}>Next</button>
        </div>
      </div>
    </section>
  );
}
