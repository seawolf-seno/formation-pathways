"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { saveStudentSparksAction } from "@/lib/sor/actions";
import { FELT_LABELS, type FeltLikeMe, type SparkFormat, type StudentSparks } from "@/lib/sor/sparks";
import type { SparkChoicePair, SparkOption } from "@/lib/spark";
import { SparkSky } from "./SparkSky";
import { SparkStarters } from "./SparkStarters";
import { SparkSwipe } from "./SparkSwipe";
import "./spark-sky.css";

type Phase =
  | { kind: "intro" }
  | { kind: "leg"; leg: 0 | 1 }
  | { kind: "felt"; leg: 0 | 1 }
  | { kind: "compare" }
  | { kind: "done" };
type Save = "idle" | "saving" | "saved" | "skipped" | { error: string };

/** Wall-clock time, read only from event handlers (timing each format). */
const now = () => Date.now();

/** What teens see for each format, in the comparison question. Not the staff labels. */
const TEEN_NAME: Record<SparkFormat, string> = {
  classic: "Questions + tapping bubbles",
  starters: "Finishing sentences",
  swipe: "Swiping cards",
};

/**
 * The Spark Lab: two Spark formats back to back, so we can learn which one
 * helps teens show who they are (and which grows the most distinctive
 * pathways). After each: "Did that feel like you?" After both: "Which felt
 * more like you?" Each format is saved as its own session, the first as soon
 * as it's done. No scores or points shown to the student, ever.
 */
export function SparkLab({
  personId,
  firstName,
  isSample,
  pair,
  labId,
  classic,
  starters,
  cards,
}: {
  personId: string;
  firstName: string;
  isSample: boolean;
  pair: [SparkFormat, SparkFormat];
  labId: string;
  classic: { questions: string[]; interests: SparkOption[]; pairs: SparkChoicePair[] };
  starters: string[];
  cards: SparkOption[];
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [results, setResults] = useState<[StudentSparks | null, StudentSparks | null]>([null, null]);
  const [seconds, setSeconds] = useState<[number, number]>([0, 0]);
  const [felt, setFelt] = useState<[FeltLikeMe | null, FeltLikeMe | null]>([null, null]);
  const [saves, setSaves] = useState<[Save, Save]>(["idle", "idle"]);
  const startedAt = useRef(0);

  // Warn before closing while a finished format isn't saved yet.
  const unsaved = results.some((r, i) => r && saves[i] !== "saved" && saves[i] !== "skipped");
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function startLeg(leg: 0 | 1) {
    startedAt.current = now();
    setPhase({ kind: "leg", leg });
  }
  function finishLeg(leg: 0 | 1, sparks: StudentSparks) {
    const took = Math.round((now() - startedAt.current) / 1000);
    setResults((r) => (leg === 0 ? [sparks, r[1]] : [r[0], sparks]));
    setSeconds((s) => (leg === 0 ? [took, s[1]] : [s[0], took]));
    setPhase({ kind: "felt", leg });
  }

  async function save(leg: 0 | 1, sparks: StudentSparks, extra: { feltLikeMe: FeltLikeMe | null; preferred?: "this" | "other" | "same"; took: number }) {
    // Nothing lit (every question skipped): nothing to save, and that's fine.
    if (!sparks.answers.length && !sparks.picks.length) {
      setSaves((s) => (leg === 0 ? ["skipped", s[1]] : [s[0], "skipped"]));
      return;
    }
    setSaves((s) => (leg === 0 ? ["saving", s[1]] : [s[0], "saving"]));
    const res = await saveStudentSparksAction({
      personId,
      sparks: {
        ...sparks,
        format: pair[leg],
        lab: {
          labId,
          order: leg + 1,
          seconds: extra.took,
          feltLikeMe: extra.feltLikeMe,
          ...(leg === 1 ? { comparedWith: pair[0], preferred: extra.preferred } : {}),
        },
      },
    });
    const next: Save = res.ok ? "saved" : { error: res.error };
    setSaves((s) => (leg === 0 ? [next, s[1]] : [s[0], next]));
  }

  function answerFelt(leg: 0 | 1, value: FeltLikeMe) {
    setFelt((f) => (leg === 0 ? [value, f[1]] : [f[0], value]));
    if (leg === 0) {
      save(0, results[0]!, { feltLikeMe: value, took: seconds[0] });
      startLeg(1);
    } else setPhase({ kind: "compare" });
  }
  function answerCompare(preferred: "this" | "other" | "same") {
    save(1, results[1]!, { feltLikeMe: felt[1], preferred, took: seconds[1] });
    setPhase({ kind: "done" });
  }
  function retry(leg: 0 | 1) {
    save(leg, results[leg]!, { feltLikeMe: felt[leg], took: seconds[leg] });
  }

  if (phase.kind === "leg" && pair[phase.leg] === "classic") {
    // The current flow brings its own sky; keyed so the second leg starts fresh.
    return (
      <SparkSky
        key={phase.leg}
        target={{ kind: "staff", personId }}
        firstName={firstName}
        questions={classic.questions}
        interests={classic.interests}
        pairs={classic.pairs}
        isSample={isSample}
        onFinish={(s) => finishLeg(phase.leg, s)}
      />
    );
  }

  const all = results.filter(Boolean) as StudentSparks[];
  const failed = ([0, 1] as const).filter((leg) => typeof saves[leg] === "object");
  const lit = [
    ...all.flatMap((s) => s.picks.map((p) => ({ label: p.label, bright: p.obsessed }))),
    ...all.flatMap((s) => s.answers.map((a) => ({ label: a.text.length > 40 ? `${a.text.slice(0, 39)}…` : a.text, bright: true }))),
    ...all.flatMap((s) => s.channels.map((c) => ({ label: `▶ ${c}`, bright: false }))),
  ];

  return (
    <main className="spark-sky">
      <div className="spark-twinkles" aria-hidden="true" />
      <section className="spark-stage" aria-live="polite">
        {phase.kind === "intro" && (
          <div className="spark-card">
            <p className="spark-eyebrow">{isSample ? "Fictional student · Sample" : "Just for you"}</p>
            <h1>
              Two quick ways to show us what lights you up, <em>{firstName}.</em>
            </h1>
            <p className="spark-sub">
              About five minutes each. No right answers, nothing graded. After each one, tell us if it felt like you. We&apos;re
              figuring out which way works best for students, so honest beats nice.
            </p>
            <button className="spark-go" onClick={() => startLeg(0)}>Start the first one ✦</button>
          </div>
        )}

        {phase.kind === "leg" && pair[phase.leg] === "starters" && (
          <SparkStarters key={phase.leg} starters={starters} onFinish={(s) => finishLeg(phase.leg, s)} />
        )}
        {phase.kind === "leg" && pair[phase.leg] === "swipe" && (
          <SparkSwipe key={phase.leg} cards={cards} onFinish={(s) => finishLeg(phase.leg, s)} />
        )}

        {phase.kind === "felt" && (
          <div className="spark-card">
            <p className="spark-eyebrow">{phase.leg === 0 ? "First one done" : "Second one done"}</p>
            <h2>Did that feel like you?</h2>
            <div className="spark-row spark-choices">
              {(["yes", "kind_of", "not_really"] as const).map((v) => (
                <button key={v} className="spark-quiet" onClick={() => answerFelt(phase.leg, v)}>
                  {FELT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase.kind === "compare" && (
          <div className="spark-card">
            <p className="spark-eyebrow">Last question</p>
            <h2>Which one felt more like you?</h2>
            <div className="grid gap-2">
              <button className="spark-quiet" onClick={() => answerCompare("other")}>{TEEN_NAME[pair[0]]} (the first one)</button>
              <button className="spark-quiet" onClick={() => answerCompare("this")}>{TEEN_NAME[pair[1]]} (the second one)</button>
              <button className="spark-quiet" onClick={() => answerCompare("same")}>About the same</button>
            </div>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="spark-card is-wide">
            <p className="spark-eyebrow">Your sparks</p>
            <h2>
              This is {firstName}, <em>lit up.</em>
            </h2>
            <ul className="spark-lab-lit">
              {lit.map((s, i) => (
                <li key={i} className={s.bright ? "is-bright" : ""}>{s.label}</li>
              ))}
            </ul>
            {failed.length > 0 && (
              <div className="spark-row">
                <p className="spark-error">{(saves[failed[0]] as { error: string }).error}</p>
                <button className="spark-quiet" onClick={() => failed.forEach(retry)}>Try saving again</button>
              </div>
            )}
            <div className="spark-row">
              <span className="spark-sub">
                {saves.some((s) => s === "saving") ? "Saving…" : saves.every((s) => s === "saved" || s === "skipped") ? "Saved. Thank you." : ""}
              </span>
              <Link className="spark-go" href={`/pilot/people/${personId}`}>Back to {firstName}&apos;s page →</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
