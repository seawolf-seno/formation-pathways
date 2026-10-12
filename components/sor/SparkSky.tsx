"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useDictation } from "@/components/useDictation";
import { saveStudentSparksAction, submitFamilySparksAction } from "@/lib/sor/actions";
import type { StudentSparks } from "@/lib/sor/sparks";
import type { SparkChoicePair, SparkOption } from "@/lib/spark";
import { CreatorsStep } from "./SparkCreators";
import "./spark-sky.css";

type Step = "intro" | "ask" | "pull" | "lean" | "channels" | "reveal";

interface Star {
  id: string;
  label: string;
  bright: boolean;
}

/** Deterministic 0..1 values from a string (no randomness between renders). */
function hashes(id: string): () => number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 10000) / 10000;
  };
}

/**
 * Places stars in the open sky above the card (x 8–92%, y 6–40%), each one
 * clear of the labels already placed: a few deterministic candidates are
 * tried and the one farthest from its neighbours wins. Stable: adding a star
 * never moves the earlier ones.
 */
function layoutStars(stars: Star[]): Map<string, { x: number; y: number }> {
  const placed: { x: number; y: number }[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const s of stars) {
    const rand = hashes(s.id);
    let best = { x: 50, y: 22 };
    let bestGap = -1;
    for (let k = 0; k < 24; k++) {
      const c = { x: 8 + rand() * 84, y: 6 + rand() * 34 };
      // Labels are wide and short, so horizontal distance counts for less.
      const gap = placed.length ? Math.min(...placed.map((p) => Math.hypot((p.x - c.x) / 2.2, p.y - c.y))) : 99;
      if (gap > bestGap) {
        best = c;
        bestGap = gap;
      }
      if (gap > 9) break;
    }
    placed.push(best);
    out.set(s.id, best);
  }
  return out;
}

/** Constellation lines: each star joins its nearest already-joined star (a
 *  minimum spanning tree), which reads like a real constellation instead of
 *  a scribble in the order the sparks were made. */
function constellationEdges(points: { id: string; x: number; y: number }[]): [string, string][] {
  if (points.length < 2) return [];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * 1.6, a.y - b.y);
  const inTree = [points[0]];
  const rest = points.slice(1);
  const edges: [string, string][] = [];
  while (rest.length) {
    let bi = 0;
    let from = inTree[0];
    let bd = Infinity;
    rest.forEach((p, i) => {
      for (const t of inTree) {
        const d = dist(p, t);
        if (d < bd) {
          bd = d;
          bi = i;
          from = t;
        }
      }
    });
    const [next] = rest.splice(bi, 1);
    edges.push([from.id, next.id]);
    inTree.push(next);
  }
  return edges;
}

const short = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * "Light up your sparks": not a survey. Every answer, tap and choice becomes a
 * star in the student's sky, and the sky becomes their constellation at the
 * end. No scores, points or badges (product principle #6); nothing is graded.
 */
export function SparkSky({
  target,
  firstName,
  questions,
  interests,
  pairs,
  isSample,
  onFinish,
}: {
  /** In person on a staff device, or at home through a one-time family link. */
  target: { kind: "staff"; personId: string } | { kind: "family"; token: string };
  firstName: string;
  questions: string[];
  interests: SparkOption[];
  pairs: SparkChoicePair[];
  isSample: boolean;
  /** Spark Lab: skip the intro, and hand the sparks back instead of saving
   *  them and showing the sky (the lab saves, and asks how it felt). */
  onFinish?: (sparks: StudentSparks) => void;
}) {
  const [step, setStep] = useState<Step>(onFinish ? "ask" : "intro");
  const [qi, setQi] = useState(0);
  const [draft, setDraft] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [answers, setAnswers] = useState<StudentSparks["answers"]>([]);
  const [picks, setPicks] = useState<Map<string, boolean>>(new Map()); // label → obsessed
  const [custom, setCustom] = useState("");
  const [pi, setPi] = useState(0);
  const [leanings, setLeanings] = useState<StudentSparks["leanings"]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [channels, setChannels] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dictation = useDictation(setDraft);

  const stars: Star[] = useMemo(
    () => [
      // Keyed by the question and the pair, not by position: taking one answer
      // back would otherwise renumber every star after it and send the whole sky
      // skidding to new places, which looks like a glitch rather than an undo.
      ...answers.map((a) => ({ id: `a:${a.prompt}`, label: short(a.text), bright: true })),
      ...[...picks.entries()].map(([label, obsessed]) => ({ id: `p:${label}`, label, bright: obsessed })),
      // A pair they would not split still earns its star — it says both are them.
      ...leanings.map((l) => ({ id: `l:${l.a}|${l.b}`, label: l.choice || `${l.a} + ${l.b}`, bright: false })),
      ...[...channels].map((c) => ({ id: `c:${c}`, label: c, bright: false })),
    ],
    [answers, picks, leanings, channels]
  );

  function keepAnswer() {
    const text = (dictation.listening ? dictation.stop() : draft).trim();
    if (text) setAnswers((a) => [...a, { prompt: questions[qi], text, via: usedVoice ? "voice" : "text" }]);
    nextQuestion();
  }
  function nextQuestion() {
    if (dictation.listening) dictation.stop();
    setDraft("");
    setUsedVoice(false);
    if (qi + 1 < questions.length) setQi(qi + 1);
    else setStep("pull");
  }
  /** Back to the question before, with that answer pulled out of the sky and
   *  put back in the box to change or leave out. A student who says the real
   *  thing and cannot unsay it learns not to say it; nothing is saved until the
   *  sky, so taking a star back before then costs nothing. */
  function goBack() {
    if (qi === 0) return;
    if (dictation.listening) dictation.stop();
    const prev = qi - 1;
    const at = answers.findIndex((a) => a.prompt === questions[prev]);
    setDraft(at >= 0 ? answers[at].text : "");
    if (at >= 0) setAnswers((a) => a.filter((_, i) => i !== at));
    setUsedVoice(false);
    setQi(prev);
  }
  function toggleMic() {
    if (dictation.listening) dictation.stop();
    else {
      setUsedVoice(true);
      dictation.start(draft);
    }
  }

  // Tap once: lit. Twice: obsessed. Three times: off again.
  function tapInterest(label: string) {
    setPicks((m) => {
      const next = new Map(m);
      if (!next.has(label)) next.set(label, false);
      else if (!next.get(label)) next.set(label, true);
      else next.delete(label);
      return next;
    });
  }
  function addCustom() {
    const label = custom.trim().slice(0, 60);
    if (label) setPicks((m) => new Map(m).set(label, true));
    setCustom("");
  }

  // `""` is a real answer: both sides are true of them. Recorded, not skipped.
  // `chosen` holds a sentinel for it so the double-tap guard and the fade still
  // work — an empty string is falsy and would defeat both.
  function lean(choice: string) {
    if (chosen) return;
    const pair = pairs[pi];
    setChosen(choice || "\u0000both");
    setLeanings((l) => [...l, { a: pair.a, b: pair.b, choice }]);
    setTimeout(() => {
      setChosen(null);
      if (pi + 1 < pairs.length) setPi(pi + 1);
      else setStep("channels");
    }, 650);
  }

  /** Back one pair, dropping the lean that was made there. `leanings` holds one
   *  entry per pair already answered, in order, so the last one is `pi`'s. */
  function leanBack() {
    if (chosen || pi === 0) return;
    setLeanings((l) => l.slice(0, pi - 1));
    setPi(pi - 1);
  }

  // Leaving with unsaved sparks loses them, so say so before the tab closes.
  const unsaved = !saved && (answers.length > 0 || picks.size > 0);
  useEffect(() => {
    if (!unsaved || onFinish) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved, onFinish]);

  /** The sky is the end of the conversation, so it saves on arrival: closing
   *  the tab after seeing it must not lose everything. The button below stays
   *  only as a retry if saving failed.
   *
   *  Takes the creator names rather than reading `channels`, because the step
   *  before this one sets them and finishes in the same handler — state read
   *  here would still be the previous render's, and the last thing the student
   *  typed would be dropped. */
  function reveal(named: string[]) {
    if (onFinish) {
      onFinish(collected(named));
      return;
    }
    setStep("reveal");
    if (!saved && !pending && (answers.length > 0 || picks.size > 0)) save(named);
  }

  function collected(named: string[]): StudentSparks {
    return {
      answers,
      picks: [...picks.entries()].map(([label, obsessed]) => ({ label, obsessed })),
      leanings,
      channels: named,
    };
  }

  function save(named: string[]) {
    setError(null);
    start(async () => {
      const sparks = collected(named);
      const res =
        target.kind === "staff"
          ? await saveStudentSparksAction({ personId: target.personId, sparks })
          : await submitFamilySparksAction({ token: target.token, sparks });
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  const staffPage = target.kind === "staff" ? `/pilot/people/${target.personId}` : null;
  const positions = useMemo(() => layoutStars(stars), [stars]);
  const edges = useMemo(
    () => constellationEdges(stars.map((s) => ({ id: s.id, ...positions.get(s.id)! }))),
    [stars, positions]
  );

  return (
    <main className={`spark-sky ${step === "reveal" ? "is-reveal" : ""}`}>
      <div className="spark-twinkles" aria-hidden="true" />
      <svg className="spark-constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {step === "reveal" &&
          edges.map(([from, to], i) => {
            const a = positions.get(from)!;
            const b = positions.get(to)!;
            return (
              <line
                key={`${from}-${to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                pathLength={1}
                vectorEffect="non-scaling-stroke"
                className="spark-line"
                style={{ animationDelay: `${300 + i * 140}ms` }}
              />
            );
          })}
      </svg>
      <ul className="spark-stars" aria-label={`${firstName}'s sparks so far`}>
        {stars.map((s) => {
          const p = positions.get(s.id)!;
          return (
            <li key={s.id} className={`spark-star ${s.bright ? "is-bright" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span className="spark-dot" aria-hidden="true" />
              <span className="spark-label">{s.label}</span>
            </li>
          );
        })}
      </ul>

      <section className="spark-stage" aria-live="polite">
        {step === "intro" && (
          <div className="spark-card">
            <p className="spark-eyebrow">
              {isSample ? "Fictional student · Sample" : target.kind === "family" ? "From Pacifica Christian · just for you" : "Just for you"}
            </p>
            <h1>
              Let&apos;s find your sparks, <em>{firstName}.</em>
            </h1>
            <p className="spark-sub">
              No right answers. Nothing&apos;s graded. Say it out loud or type it. Everything you share becomes a star.
            </p>
            {/* Who reads this, said before the first question rather than after
                the last one. A student deciding how honest to be is deciding it
                now, and guessing at the audience is the thing that makes them
                hedge. Accurate as of the policies on student_sparks: teachers,
                advisors and admissions can read these; plain staff cannot. */}
            <p className="spark-who">
              Teachers and advisors here read your sparks, and so does admissions. It isn&apos;t graded
              or scored and it doesn&apos;t count toward anything. Skip any question you want, and you
              can go back and take a star down before you&apos;re done.
            </p>
            <button className="spark-go" onClick={() => setStep("ask")}>Light the first one ✦</button>
          </div>
        )}

        {step === "ask" && (
          <div className="spark-card" key={qi}>
            <p className="spark-eyebrow">
              {qi + 1} of {questions.length}
            </p>
            <h2>{questions[qi]}</h2>
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
              placeholder={dictation.supported ? "Tap the mic and just talk, or type here…" : "Type here…"}
            />
            <div className="spark-row">
              <span className="spark-row-left">
                {qi > 0 && (
                  <button className="spark-quiet" onClick={goBack}>
                    ← Back
                  </button>
                )}
                <button className="spark-quiet" onClick={nextQuestion}>Skip</button>
              </span>
              <button className="spark-go" onClick={keepAnswer} disabled={!draft.trim() && !dictation.interim}>
                Make it a star ✦
              </button>
            </div>
          </div>
        )}

        {step === "pull" && (
          <div className="spark-card is-wide">
            <p className="spark-eyebrow">What pulls you in?</p>
            <h2>Tap what you love. Tap twice if you&apos;re obsessed.</h2>
            <div className="spark-bubbles">
              {interests.map((o, i) => {
                const state = picks.has(o.label) ? (picks.get(o.label) ? "is-obsessed" : "is-lit") : "";
                return (
                  <button
                    key={o.label}
                    className={`spark-bubble ${state}`}
                    style={{ animationDelay: `${(i % 7) * -0.9}s` }}
                    onClick={() => tapInterest(o.label)}
                    aria-pressed={picks.has(o.label)}
                  >
                    <span aria-hidden="true">{o.emoji}</span> {o.label}
                  </button>
                );
              })}
            </div>
            <div className="spark-row">
              <input
                className="spark-input is-line"
                value={custom}
                maxLength={60}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="Something we missed? Add it…"
              />
              <button className="spark-quiet" onClick={addCustom} disabled={!custom.trim()}>Add</button>
            </div>
            <div className="spark-row">
              <span />
              <button className="spark-go" onClick={() => setStep(pairs.length ? "lean" : "channels")}>Next ✦</button>
            </div>
          </div>
        )}

        {step === "lean" && pairs[pi] && (
          <div className="spark-card is-wide" key={pi}>
            <p className="spark-eyebrow">Which sounds more like you?</p>
            <div className="spark-pair">
              {[pairs[pi].a, pairs[pi].b].map((side) => (
                <button
                  key={side}
                  className={`spark-side ${chosen === side ? "is-chosen" : chosen ? "is-faded" : ""}`}
                  onClick={() => lean(side)}
                >
                  {side}
                </button>
              ))}
            </div>
            <button
              className={`spark-both ${chosen === "\u0000both" ? "is-chosen" : chosen ? "is-faded" : ""}`}
              onClick={() => lean("")}
            >
              Both, honestly
            </button>
            <p className="spark-sub">No wrong side — and &ldquo;both&rdquo; counts as an answer.</p>
            {pi > 0 && (
              <button className="spark-quiet" onClick={leanBack}>
                ← Back
              </button>
            )}
          </div>
        )}

        {/* The student names who they watch instead of handing over a history
            file. Watch history is a picture of the recommender — what autoplayed
            at midnight, what a friend sent — not of them, so it answered a
            question nobody asked. The three they choose to name are the better
            signal anyway, and choosing is the whole point: nothing about them
            gets collected that they didn't decide to say. */}
        {step === "channels" && (
          <CreatorsStep
            onDone={(named) => {
              setChannels(new Set(named));
              reveal(named);
            }}
            done={onFinish ? "Done with this one ✦" : "Show me my sky ✦"}
          />
        )}

        {step === "reveal" && (
          <div className="spark-card is-reveal-card">
            <p className="spark-eyebrow">Your constellation</p>
            <h2>
              This is {firstName}, <em>lit up.</em>
            </h2>
            <p className="spark-sub">
              {stars.length} spark{stars.length === 1 ? "" : "s"}. Your next pathways start here, written by people who know
              you and read by you first.
            </p>
            {saved && !staffPage ? (
              <p className="spark-sub">
                Thank you, {firstName}. Your sparks are on their way to the people who know you at Pacifica. Next time you
                talk, they&apos;ll be part of the conversation. You can close this page.
              </p>
            ) : saved ? (
              <div className="spark-row">
                <span className="spark-sub">Saved. Nothing goes anywhere without a conversation first.</span>
                <Link className="spark-go" href={staffPage ?? "/pilot"}>
                  Back to {firstName}&apos;s page →
                </Link>
              </div>
            ) : pending ? (
              <p className="spark-sub">Saving…</p>
            ) : (
              <div className="spark-row">
                <button className="spark-quiet" onClick={() => setStep("pull")}>Add more</button>
                <button className="spark-go" onClick={() => save([...channels])} disabled={stars.length === 0}>
                  {error ? "Try saving again ✦" : "Save my sparks ✦"}
                </button>
              </div>
            )}
            {error && <p className="spark-error">{error}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
