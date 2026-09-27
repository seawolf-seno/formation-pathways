"use client";

import { useState, useTransition } from "react";
import { submitSparkResponseAction } from "@/lib/actions";
import {
  MAX_INTERESTS,
  MAX_NOTE_LENGTH,
  MIN_INTERESTS,
  type SparkChoicePair,
  type SparkOption,
  type SparkResponse,
} from "@/lib/spark";

type Step = "interests" | number | "note" | "done";

export function SparkSurvey({
  sparkToken,
  firstName,
  interests,
  choicePairs,
  existing,
}: {
  sparkToken: string;
  firstName: string;
  interests: SparkOption[];
  choicePairs: SparkChoicePair[];
  existing: SparkResponse | null;
}) {
  const [picked, setPicked] = useState<string[]>(existing?.interests ?? []);
  const [choices, setChoices] = useState<string[]>(existing?.choices ?? []);
  const [note, setNote] = useState(existing?.note ?? "");
  const [step, setStep] = useState<Step>("interests");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(label: string) {
    setPicked((cur) => {
      if (cur.includes(label)) return cur.filter((l) => l !== label);
      if (cur.length >= MAX_INTERESTS) return cur;
      return [...cur, label];
    });
  }

  function pickChoice(index: number, value: string) {
    setChoices((cur) => {
      const next = [...cur];
      next[index] = value;
      return next;
    });
    if (index < choicePairs.length - 1) setStep(index + 1);
    else setStep("note");
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        await submitSparkResponseAction(sparkToken, {
          interests: picked,
          choices,
          note: note.trim() || null,
        });
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      }
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border-t-8 border-[var(--color-gold)] bg-white p-8 text-center shadow-lg">
        <p className="font-display text-2xl text-[var(--color-navy-ink)]">
          Thanks, {firstName}.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Pacifica now has a better sense of you already — before an essay, before an interview.
          Whenever you&apos;re ready for the rest of the application, this only helps it along.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-t-8 border-[var(--color-gold)] bg-white p-6 shadow-lg sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
        Pacifica Christian High School · A quick spark, not an application
      </p>
      <h1 className="mt-3 font-display text-2xl text-[var(--color-navy-ink)]">
        {step === "interests"
          ? `Hi ${firstName}. What sounds like you?`
          : step === "note"
            ? "Anything else?"
            : "Pick the one that's more you"}
      </h1>

      {step === "interests" && (
        <>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Tap {MIN_INTERESTS}–{MAX_INTERESTS}. There&apos;s no wrong answer, and this isn&apos;t
            graded.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {interests.map((opt) => {
              const active = picked.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => toggle(opt.label)}
                  aria-pressed={active}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                      : "border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-navy)]"
                  }`}
                >
                  <span className="mr-1">{opt.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(0)}
            disabled={picked.length < MIN_INTERESTS}
            className="mt-6 w-full rounded-full bg-[var(--color-navy)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {picked.length < MIN_INTERESTS
              ? `Pick ${MIN_INTERESTS - picked.length} more`
              : "Next"}
          </button>
        </>
      )}

      {typeof step === "number" && (
        <>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Either/or {step + 1} of {choicePairs.length}
          </p>
          <div className="mt-5 grid gap-3">
            {[choicePairs[step].a, choicePairs[step].b].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickChoice(step, option)}
                className="rounded-xl border border-[var(--color-border)] px-5 py-4 text-left text-base font-medium text-[var(--color-navy-ink)] hover:border-[var(--color-navy)] hover:bg-[var(--color-pacific-light)]"
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(step === 0 ? "interests" : step - 1)}
            className="mt-4 text-sm text-[var(--color-ink-muted)]"
          >
            ← Back
          </button>
        </>
      )}

      {step === "note" && (
        <>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Totally optional — anything you want us to know before you write your essays.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            rows={4}
            placeholder="Skip this if you'd rather not…"
            className="mt-4 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-base focus:border-[var(--color-navy)] focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-[var(--color-ink-muted)]">
            {note.length}/{MAX_NOTE_LENGTH}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(choicePairs.length - 1)}
              className="text-sm text-[var(--color-ink-muted)]"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-full bg-[var(--color-gold)] px-6 py-3 text-sm font-semibold text-[var(--color-navy-ink)] disabled:opacity-50"
            >
              {pending ? "Sending…" : "Done"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
