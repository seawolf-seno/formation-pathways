"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SparkOption } from "@/lib/spark";
import type { StudentSparks } from "@/lib/sor/sparks";
import { CreatorsStep } from "./SparkCreators";
import { SparkSkills, type SparkSkills as Skills } from "./SparkSkills";

const THRESHOLD = 80;
const MIN_BEFORE_DONE = 8;

/**
 * Spark Lab format "swipe": specific cards, not categories. Right (or "Me")
 * lights a card, up (or "So me ✦") marks it as an obsession and asks why in a
 * few words, left passes. Drag, buttons or arrow keys all work.
 */
export function SparkSwipe({
  cards,
  genres,
  skillQuestions,
  onFinish,
}: {
  cards: SparkOption[];
  genres: SparkOption[];
  /** The two skill questions (prompts/spark-skills.txt), in order. */
  skillQuestions: string[];
  onFinish: (s: StudentSparks) => void;
}) {
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<StudentSparks["picks"]>([]);
  const [answers, setAnswers] = useState<StudentSparks["answers"]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [whyDraft, setWhyDraft] = useState("");
  const [creators, setCreators] = useState(false);
  const [skills, setSkills] = useState<Skills | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number } | null>(null);

  const card = cards[i];
  const advance = () => {
    setDrag({ x: 0, y: 0 });
    if (i + 1 < cards.length) setI(i + 1);
    else setCreators(true);
  };
  function decide(choice: "no" | "yes" | "so") {
    if (!card) return;
    if (choice !== "no") setPicks((p) => [...p, { label: card.label, obsessed: choice === "so" }]);
    if (choice === "so") {
      setDrag({ x: 0, y: 0 });
      setWhy(card.label);
    } else advance();
  }
  function keepWhy() {
    if (why && whyDraft.trim()) setAnswers((a) => [...a, { prompt: `Why "${why}"?`, text: whyDraft.trim(), via: "text" }]);
    setWhy(null);
    setWhyDraft("");
    advance();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    origin.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (origin.current) setDrag({ x: e.clientX - origin.current.x, y: e.clientY - origin.current.y });
  }
  function onPointerUp() {
    origin.current = null;
    if (drag.y < -THRESHOLD && Math.abs(drag.y) > Math.abs(drag.x)) decide("so");
    else if (drag.x > THRESHOLD) decide("yes");
    else if (drag.x < -THRESHOLD) decide("no");
    else setDrag({ x: 0, y: 0 });
  }

  if (creators) {
    // The tail is the same two cards in every format: skills, then media.
    if (!skills) return <SparkSkills questions={skillQuestions} onDone={setSkills} />;
    return <CreatorsStep genres={genres} onDone={(media) => onFinish({ answers, picks, leanings: [], ...skills, ...media })} />;
  }

  if (why) {
    return (
      <div className="spark-card">
        <p className="spark-eyebrow">✦ So you</p>
        <h2>Why &ldquo;{why}&rdquo;?</h2>
        <p className="spark-sub">A few words is plenty. What&apos;s the best part, or the last time you did it?</p>
        <input
          className="spark-input is-line"
          value={whyDraft}
          maxLength={600}
          autoFocus
          onChange={(e) => setWhyDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && keepWhy()}
        />
        <div className="spark-row">
          <button className="spark-quiet" onClick={keepWhy}>Skip</button>
          <button className="spark-go" onClick={keepWhy} disabled={!whyDraft.trim()}>Keep going ✦</button>
        </div>
      </div>
    );
  }

  const leaning = drag.y < -THRESHOLD / 2 && Math.abs(drag.y) > Math.abs(drag.x) ? "so" : drag.x > THRESHOLD / 2 ? "yes" : drag.x < -THRESHOLD / 2 ? "no" : "";
  return (
    <div
      className="spark-card spark-swipe"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") decide("no");
        else if (e.key === "ArrowRight") decide("yes");
        else if (e.key === "ArrowUp") decide("so");
      }}
    >
      <p className="spark-eyebrow">
        Is this you? · {i + 1} of {cards.length}
      </p>
      <div
        className={`spark-swipe-card ${leaning ? `is-${leaning}` : ""}`}
        style={{ transform: `translate(${drag.x}px, ${Math.min(0, drag.y)}px) rotate(${drag.x / 18}deg)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          origin.current = null;
          setDrag({ x: 0, y: 0 });
        }}
      >
        <span className="spark-swipe-emoji" aria-hidden="true">{card?.emoji}</span>
        <span className="spark-swipe-label">{card?.label}</span>
        <span className="spark-swipe-hint" aria-hidden="true">
          {leaning === "so" ? "✦ So me" : leaning === "yes" ? "Me" : leaning === "no" ? "Not me" : "← not me · me → · ↑ so me"}
        </span>
      </div>
      <div className="spark-row spark-swipe-buttons">
        <button className="spark-quiet" onClick={() => decide("no")}>Not me</button>
        <button className="spark-quiet" onClick={() => decide("yes")}>Me</button>
        <button className="spark-go" onClick={() => decide("so")}>So me ✦</button>
      </div>
      {i >= MIN_BEFORE_DONE && (
        <button className="spark-quiet spark-swipe-done" onClick={() => setCreators(true)}>
          That&apos;s enough cards →
        </button>
      )}
    </div>
  );
}
