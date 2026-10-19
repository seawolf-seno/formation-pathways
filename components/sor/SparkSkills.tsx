"use client";

import { useState } from "react";

/** What the student said they can do, and what they're reaching for. Arrays
 *  because sittings accumulate: a second Spark, or the family doing one at
 *  home, adds to these rather than replacing them (mergeSparks). */
export interface SparkSkills {
  canTeach: string[];
  growing: string[];
}

/**
 * The skills card, asked just before the media card in every Spark format.
 *
 * Two questions, no levels. The Mastery Hub has a real ladder
 * (beginning → developing → proficient → extending, lib/mastery/config.ts),
 * but it is derived from evidence a teacher marked. Asking a 15-year-old to
 * place themselves on it would make a Spark into a self-assessment score —
 * a dossier the student wrote about themselves, which is worse than one we
 * wrote. So these stay words, and reach a draft as the same
 * "solid on … / still growing on …" shape the Mastery Hub already uses.
 *
 * There's no mic here, unlike the open questions: the answers are a phrase,
 * not a story, and two dictation sessions on one card would fight over the
 * microphone. Both questions are skippable, together and separately.
 */
export function SparkSkills({
  questions,
  onDone,
  done = "Next ✦",
}: {
  /** Two lines from prompts/spark-skills.txt: the proud one, then the
   *  intention. Order is load-bearing — see the note in that file. */
  questions: string[];
  onDone: (skills: SparkSkills) => void;
  done?: string;
}) {
  const [teach, setTeach] = useState("");
  const [growing, setGrowing] = useState("");
  const collected = {
    canTeach: teach.trim() ? [teach.trim()] : [],
    growing: growing.trim() ? [growing.trim()] : [],
  };
  const anything = collected.canTeach.length > 0 || collected.growing.length > 0;

  return (
    <div className="spark-card is-wide">
      <p className="spark-eyebrow">Two quick ones</p>
      <h2>{questions[0]}</h2>
      <p className="spark-sub">
        Anything counts. Fixing a bike, calming someone down, a card trick, a recipe, a game nobody
        else gets. It doesn&apos;t have to be school.
      </p>
      <input
        className="spark-input is-line"
        value={teach}
        maxLength={160}
        aria-label={questions[0]}
        placeholder="e.g. replace a bike chain"
        onChange={(e) => setTeach(e.target.value)}
      />

      <h3 className="spark-sub-head">{questions[1]}</h3>
      {/* Said plainly, because a teenager reads "what are you bad at" into
          this question unless you tell them otherwise. Nothing here is a
          weakness, nothing is ranked, and the draft is told the same. */}
      <p className="spark-sub">
        Not what you&apos;re bad at — what you&apos;re working on. Nobody&apos;s grading this and it
        isn&apos;t compared to anyone.
      </p>
      <input
        className="spark-input is-line"
        value={growing}
        maxLength={160}
        aria-label={questions[1]}
        placeholder="e.g. speaking in front of a class"
        onChange={(e) => setGrowing(e.target.value)}
      />

      <div className="spark-row">
        <button className="spark-quiet" onClick={() => onDone({ canTeach: [], growing: [] })}>
          Skip
        </button>
        <button className="spark-go" onClick={() => onDone(collected)} disabled={!anything}>
          {done}
        </button>
      </div>
    </div>
  );
}
