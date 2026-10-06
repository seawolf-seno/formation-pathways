"use client";

import { useState } from "react";

/**
 * "Name three creators you actually watch or listen to": YouTube, TikTok,
 * podcasts, Spotify, anyone. Typed, so only what they choose is shared;
 * replaces the Takeout upload in the Spark Lab formats.
 */
export function CreatorsStep({ onDone }: { onDone: (channels: string[]) => void }) {
  const [names, setNames] = useState(["", "", ""]);
  const filled = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  return (
    <div className="spark-card">
      <p className="spark-eyebrow">Last one</p>
      <h2>Who do you actually watch or listen to?</h2>
      <p className="spark-sub">Up to three creators, channels, podcasts or artists. Only what you type here is shared.</p>
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
        <button className="spark-quiet" onClick={() => onDone([])}>Skip</button>
        <button className="spark-go" onClick={() => onDone(filled)} disabled={!filled.length}>Done ✦</button>
      </div>
    </div>
  );
}
