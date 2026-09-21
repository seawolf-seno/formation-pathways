"use client";

import { useRef, useState } from "react";
import {
  saveApplicantAnswerAction,
  startApplicantAction,
  submitApplicantAction,
} from "@/lib/actions";
import type { Applicant } from "@/lib/types";

type Step = "name" | number | "submitting" | "done";

export function ApplicantQuestionnaire() {
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>("name");
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleStart() {
    if (!name.trim()) return;
    setStarting(true);
    try {
      const created = await startApplicantAction(name);
      setApplicant(created);
      setStep(0);
    } finally {
      setStarting(false);
    }
  }

  function handleAnswerChange(index: number, value: string) {
    if (!applicant) return;
    setApplicant({
      ...applicant,
      answers: applicant.answers.map((a, i) =>
        i === index ? { ...a, answer: value } : a
      ),
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveApplicantAnswerAction(applicant.id, index, value);
    }, 500);
  }

  async function handleSubmit() {
    if (!applicant) return;
    setStep("submitting");
    await submitApplicantAction(applicant.id);
    setStep("done");
  }

  if (step === "name") {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">
          Let&apos;s get to know you
        </h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Five short questions. No multiple choice, no wrong answers.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          placeholder="Your full name"
          className="mt-8 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-center font-display text-lg text-[var(--color-navy-ink)] focus:border-[var(--color-navy)] focus:outline-none"
        />
        <button
          onClick={handleStart}
          disabled={!name.trim() || starting}
          className="mt-6 rounded-xl bg-[var(--color-navy)] px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {starting ? "One moment…" : "Begin"}
        </button>
      </div>
    );
  }

  if (step === "submitting") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">
          Reading what you wrote…
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
          Thank you, {applicant?.name.split(" ")[0]}.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Our admissions team is reading what you wrote. When they&apos;re
          ready, they&apos;ll send you a page written just for you.
        </p>
      </div>
    );
  }

  if (!applicant) return null;
  const index = step;
  const total = applicant.answers.length;
  const current = applicant.answers[index];
  const isLast = index === total - 1;

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        {applicant.answers.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= index ? "bg-[var(--color-gold)]" : "bg-[var(--color-border)]"
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
        Question {index + 1} of {total}
      </p>
      <h2 className="mt-3 font-display text-2xl leading-snug text-[var(--color-navy-ink)]">
        {current.question}
      </h2>
      <textarea
        autoFocus
        value={current.answer}
        onChange={(e) => handleAnswerChange(index, e.target.value)}
        rows={6}
        placeholder="Take your time…"
        className="mt-6 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-base leading-relaxed text-[var(--color-ink)] focus:border-[var(--color-navy)] focus:outline-none"
      />
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep(index === 0 ? "name" : index - 1)}
          className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-navy-ink)]"
        >
          ← Back
        </button>
        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={!current.answer.trim()}
            className="rounded-xl bg-[var(--color-navy)] px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Submit
          </button>
        ) : (
          <button
            onClick={() => setStep(index + 1)}
            disabled={!current.answer.trim()}
            className="rounded-xl bg-[var(--color-navy)] px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
