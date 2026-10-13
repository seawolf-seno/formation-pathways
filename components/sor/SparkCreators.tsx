"use client";

import { useState } from "react";
import type { SparkOption } from "@/lib/spark";

/** What the student chose to say about what they watch. */
export interface SparkMedia {
  channels: string[];
  genres: string[];
}

/**
 * The media step, last in every Spark format: what fills their feed, and who
 * they actually watch. Both are tapped or typed by the student, which is the
 * whole design — this stands in place of a watch-history import, so nothing
 * about what they watch is collected that they didn't decide to say.
 */
export function CreatorsStep({
  genres,
  onDone,
  done = "Done ✦",
}: {
  genres: SparkOption[];
  onDone: (media: SparkMedia) => void;
  done?: string;
}) {
  const [names, setNames] = useState(["", "", ""]);
  const [tapped, setTapped] = useState<Set<string>>(new Set());
  const filled = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const media = { channels: filled, genres: [...tapped] };

  function tap(label: string) {
    setTapped((s) => {
      const next = new Set(s);
      if (!next.delete(label)) next.add(label);
      return next;
    });
  }

  return (
    <div className="spark-card is-wide">
      <p className="spark-eyebrow">Last one</p>
      <h2>What do you actually end up watching?</h2>
      <p className="spark-sub">
        YouTube, TikTok, whatever&apos;s open at 11pm. Tap as many as are true — being into a lot of
        different things is a real answer here.
      </p>
      <ul className="spark-genres">
        {genres.map((g) => (
          <li key={g.label}>
            <button
              className={`spark-genre ${tapped.has(g.label) ? "is-on" : ""}`}
              aria-pressed={tapped.has(g.label)}
              onClick={() => tap(g.label)}
            >
              <span aria-hidden="true">{g.emoji}</span> {g.label}
            </button>
          </li>
        ))}
      </ul>
      <h3 className="spark-sub-head">And who do you actually watch or listen to?</h3>
      <p className="spark-sub">
        Up to three creators, channels, podcasts or artists. Only what you type here is shared.
      </p>
      <div className="grid gap-2">
        {names.map((n, i) => (
          <input
            key={i}
            className="spark-input is-line"
            value={n}
            maxLength={80}
            aria-label={`Creator ${i + 1}`}
            placeholder={["e.g. a YouTube channel", "a podcast", "anyone"][i]}
            onChange={(e) => setNames((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
      </div>
      <div className="spark-row">
        <button className="spark-quiet" onClick={() => onDone({ channels: [], genres: [] })}>Skip</button>
        <button className="spark-go" onClick={() => onDone(media)} disabled={!filled.length && !tapped.size}>
          {done}
        </button>
      </div>
    </div>
  );
}
