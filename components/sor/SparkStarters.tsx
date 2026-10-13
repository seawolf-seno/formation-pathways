"use client";

import { useState } from "react";
import { useDictation } from "@/components/useDictation";
import { specificDetails } from "@/lib/sor/spark-lab";
import type { StudentSparks } from "@/lib/sor/sparks";
import type { SparkOption } from "@/lib/spark";
import { CreatorsStep } from "./SparkCreators";

/**
 * Spark Lab format "starters": finish a sentence instead of answering an open
 * question, out loud or typed. When an answer has no specifics (no names,
 * places, numbers), one gentle nudge asks for an example; it's always skippable.
 */
export function SparkStarters({
  starters,
  genres,
  onFinish,
}: {
  starters: string[];
  genres: SparkOption[];
  onFinish: (s: StudentSparks) => void;
}) {
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [answers, setAnswers] = useState<StudentSparks["answers"]>([]);
  const [pending, setPending] = useState<StudentSparks["answers"][number] | null>(null);
  const [example, setExample] = useState("");
  const [creators, setCreators] = useState(false);
  const dictation = useDictation(setDraft);

  function next(answer: StudentSparks["answers"][number] | null) {
    if (answer) setAnswers((a) => [...a, answer]);
    setPending(null);
    setExample("");
    setDraft("");
    setUsedVoice(false);
    if (i + 1 < starters.length) setI(i + 1);
    else setCreators(true);
  }
  function keep() {
    const text = (dictation.listening ? dictation.stop() : draft).trim();
    if (!text) return next(null);
    const answer = { prompt: starters[i], text, via: usedVoice ? ("voice" as const) : ("text" as const) };
    if (specificDetails(text) === 0) setPending(answer);
    else next(answer);
  }
  function toggleMic() {
    if (dictation.listening) dictation.stop();
    else {
      setUsedVoice(true);
      dictation.start(draft);
    }
  }

  if (creators) {
    return <CreatorsStep genres={genres} onDone={(media) => onFinish({ answers, picks: [], leanings: [], ...media })} />;
  }

  if (pending) {
    return (
      <div className="spark-card">
        <p className="spark-eyebrow">One more thing</p>
        <h2>Give one specific example.</h2>
        <p className="spark-sub">A name, a place, a thing. &ldquo;{pending.text}&rdquo;, like what?</p>
        <input
          className="spark-input is-line"
          value={example}
          maxLength={300}
          autoFocus
          onChange={(e) => setExample(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && example.trim() && next({ ...pending, text: `${pending.text} (For example: ${example.trim()})` })}
          placeholder="e.g. the bike shop on Main St"
        />
        <div className="spark-row">
          <button className="spark-quiet" onClick={() => next(pending)}>Skip</button>
          <button
            className="spark-go"
            disabled={!example.trim()}
            onClick={() => next({ ...pending, text: `${pending.text} (For example: ${example.trim()})` })}
          >
            Add it ✦
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="spark-card" key={i}>
      <p className="spark-eyebrow">
        Finish the sentence · {i + 1} of {starters.length}
      </p>
      <h2>{starters[i]}</h2>
      {dictation.supported && (
        <button
          className={`spark-mic ${dictation.listening ? "is-listening" : ""}`}
          onClick={toggleMic}
          aria-label={dictation.listening ? "Stop listening" : "Answer out loud"}
        >
          <span aria-hidden="true">{dictation.listening ? "■" : "🎙"}</span>
        </button>
      )}
      <textarea
        className="spark-input"
        rows={3}
        maxLength={1200}
        value={dictation.interim ? `${draft} ${dictation.interim}` : draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={dictation.supported ? "Tap the mic and just say it, or type…" : "Type…"}
      />
      <div className="spark-row">
        <button className="spark-quiet" onClick={() => next(null)}>Skip</button>
        <button className="spark-go" onClick={keep} disabled={!draft.trim() && !dictation.interim}>
          Next ✦
        </button>
      </div>
    </div>
  );
}
