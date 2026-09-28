"use client";

import { useRef, useState } from "react";
import {
  saveApplicantAnswerAction,
  startApplicantAction,
  submitApplicantAction,
} from "@/lib/actions";
import { PacificaLogo } from "@/components/PacificaLogo";
import type { Applicant } from "@/lib/types";
import "./apply-experience.css";

type Step = "name" | number | "submitting" | "done";

export function ApplicantQuestionnaire({ helpIdeas = [] }: { helpIdeas?: string[][] }) {
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

  return (
    <div className="apply-experience">
      <header className="apply-header">
        <PacificaLogo />
      </header>

      <div className="apply-body">
        {step === "name" && (
          <>
            <p className="apply-eyebrow">Admissions · Formation Pathways</p>
            <div className="apply-card">
              <h1>Let&apos;s get to know you</h1>
              <p>Five short questions. No multiple choice, no wrong answers.</p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="Your full name"
                className="apply-name-input"
              />
              <div>
                <button
                  onClick={handleStart}
                  disabled={!name.trim() || starting}
                  className="apply-button is-gold"
                >
                  {starting ? "One moment…" : "Begin"}
                </button>
              </div>
            </div>
          </>
        )}

        {step === "submitting" && (
          <div className="apply-card">
            <h1>Reading what you wrote…</h1>
          </div>
        )}

        {step === "done" && (
          <div className="apply-card">
            <h1>Thank you, {applicant?.name.split(" ")[0]}.</h1>
            <p>
              Our admissions team is reading what you wrote. When they&apos;re
              ready, they&apos;ll send you a page written just for you.
            </p>
          </div>
        )}

        {typeof step === "number" && applicant && (() => {
          const index = step;
          const total = applicant.answers.length;
          const current = applicant.answers[index];
          const isLast = index === total - 1;
          return (
            <>
              <div className="apply-progress">
                {applicant.answers.map((_, i) => (
                  <span key={i} className={i <= index ? "is-filled" : ""} />
                ))}
              </div>
              <div className="apply-question">
                <p className="apply-question-label">
                  Question {index + 1} of {total}
                </p>
                <h2>{current.question}</h2>
                {helpIdeas[index] && helpIdeas[index].length > 0 && (
                  <details className="apply-help">
                    <summary>Not sure where to start?</summary>
                    <p>A short, honest answer is enough. A few things to think about, in your own words:</p>
                    <ul>
                      {helpIdeas[index].map((idea, i) => (
                        <li key={i}>{idea}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <textarea
                  autoFocus
                  value={current.answer}
                  onChange={(e) => handleAnswerChange(index, e.target.value)}
                  rows={6}
                  placeholder="Take your time…"
                  className="apply-textarea"
                />
                <div className="apply-nav">
                  <button
                    onClick={() => setStep(index === 0 ? "name" : index - 1)}
                    className="apply-back"
                  >
                    ← Back
                  </button>
                  {isLast ? (
                    <button
                      onClick={handleSubmit}
                      disabled={!current.answer.trim()}
                      className="apply-button"
                    >
                      Submit
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep(index + 1)}
                      disabled={!current.answer.trim()}
                      className="apply-button"
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
