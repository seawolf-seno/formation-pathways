"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { draftCaptureAction, matchCaptureAction, saveCaptureAction } from "@/lib/sor/actions";
import { FORMATION_TAGS, type FormationTag } from "@/lib/types";

// Minimal ambient types for the Web Speech API (same shape as CaptureModal).
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent extends Event { resultIndex: number; results: SpeechResult[] & { length: number } }
interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

const noopSubscribe = () => () => {};
function speechImpl() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

type Step = "speak" | "who" | "review" | "saved";
interface Candidate { id: string; name: string }

export function PhoneCapture({ roster, staffName }: { roster: Candidate[]; staffName: string }) {
  const [step, setStep] = useState<Step>("speak");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  // false during SSR, real answer after hydration — no mismatch.
  const supported = useSyncExternalStore(noopSubscribe, () => Boolean(speechImpl()), () => false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [person, setPerson] = useState<Candidate | null>(null);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<Set<FormationTag>>(new Set());
  const [flag, setFlag] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const Impl = speechImpl();
    if (!Impl) return;
    const r = new Impl();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let final = "";
      let temp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else temp += e.results[i][0].transcript;
      }
      if (final) setText((t) => (t ? `${t} ${final.trim()}` : final.trim()));
      setInterim(temp);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    rec.current = r;
    return () => r.stop();
  }, []);

  function toggleMic() {
    if (!rec.current) return;
    if (listening) {
      rec.current.stop();
      setListening(false);
    } else {
      setUsedVoice(true);
      rec.current.start();
      setListening(true);
    }
  }

  async function findWho() {
    rec.current?.stop();
    const full = `${text} ${interim}`.trim();
    setText(full);
    setInterim("");
    if (!full) return;
    setBusy(true);
    setError(null);
    const res = await matchCaptureAction(full);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCandidates(res.candidates);
    setStep("who");
  }

  async function choose(c: Candidate) {
    setPerson(c);
    setBusy(true);
    setError(null);
    const res = await draftCaptureAction(c.id, text);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setBody(res.cleanText);
    setTags(new Set(res.tags));
    setFlag(res.disciplineFlag);
    setNote(res.aiNote);
    setStep("review");
  }

  async function save() {
    if (!person) return;
    setBusy(true);
    setError(null);
    const res = await saveCaptureAction({
      personId: person.id,
      rawText: text,
      body,
      tags: [...tags],
      source: usedVoice ? "voice" : "text",
      disciplineFlag: flag,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setStep("saved");
  }

  function reset() {
    setStep("speak");
    setText("");
    setInterim("");
    setUsedVoice(false);
    setPerson(null);
    setCandidates([]);
    setBody("");
    setTags(new Set());
    setFlag(null);
    setNote(null);
    setError(null);
  }

  const primary = "w-full rounded-2xl bg-[var(--color-navy)] px-5 py-4 text-lg font-medium text-white disabled:opacity-50";
  const secondary = "w-full rounded-2xl border border-[var(--color-border)] bg-white px-5 py-3 text-base text-[var(--color-navy-ink)]";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      {step === "speak" && (
        <>
          <p className="text-center text-sm text-[var(--color-ink-muted)]">
            Say the student&apos;s name, then what you saw.
            <br />
            <span className="italic">&ldquo;Iris stayed after chapel to help a freshman who was crying.&rdquo;</span>
          </p>
          {supported && (
            <button
              onClick={toggleMic}
              aria-label={listening ? "Stop recording" : "Start recording"}
              className={`mx-auto flex h-40 w-40 items-center justify-center rounded-full text-6xl shadow-lg transition ${
                listening ? "animate-pulse bg-red-600 text-white" : "bg-[var(--color-gold)] text-[var(--color-navy-ink)]"
              }`}
            >
              {listening ? "■" : "🎙"}
            </button>
          )}
          <textarea
            value={interim ? `${text} ${interim}` : text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={supported ? "Your words appear here. You can also type." : "Type what you saw (voice isn't available in this browser)."}
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white p-4 text-base"
          />
          <button onClick={findWho} disabled={busy || !(text || interim)} className={primary}>
            {busy ? "Finding…" : "Next"}
          </button>
        </>
      )}

      {step === "who" && (
        <>
          <p className="text-center text-base text-[var(--color-navy-ink)]">Who is this about?</p>
          {candidates.map((c, i) => (
            <button key={c.id} onClick={() => choose(c)} disabled={busy} className={i === 0 ? primary : secondary}>
              {c.name}
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="text-center text-sm text-[var(--color-ink-muted)]">I didn&apos;t catch a name from the pilot list.</p>
          )}
          <select
            defaultValue=""
            onChange={(e) => {
              const c = roster.find((r) => r.id === e.target.value);
              if (c) choose(c);
            }}
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-base"
          >
            <option value="" disabled>
              {candidates.length ? "Someone else…" : "Pick the student…"}
            </option>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={() => setStep("speak")} className="text-sm text-[var(--color-ink-muted)] underline">Back</button>
        </>
      )}

      {step === "review" && person && (
        <>
          <p className="text-center text-base text-[var(--color-navy-ink)]">
            About <strong>{person.name}</strong>
          </p>
          {note && <p className="rounded-xl bg-[var(--color-pacific-light)] p-3 text-xs text-[var(--color-navy-ink)]">{note}</p>}
          {flag && (
            <p className="rounded-xl bg-[var(--color-gold-light)] p-3 text-sm text-[var(--color-navy-ink)]">
              {flag} <span className="block text-xs">You can reframe it, or save as is.</span>
            </p>
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-2xl border border-[var(--color-border)] bg-white p-4 text-base" />
          <div className="flex flex-wrap gap-2">
            {FORMATION_TAGS.map((t) => (
              <button
                key={t}
                onClick={() =>
                  setTags((s) => {
                    const n = new Set(s);
                    if (n.has(t)) n.delete(t);
                    else n.add(t);
                    return n;
                  })
                }
                className={`rounded-full px-3 py-1.5 text-sm ${tags.has(t) ? "bg-[var(--color-navy)] text-white" : "bg-white text-[var(--color-ink-muted)] ring-1 ring-[var(--color-border)]"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button onClick={save} disabled={busy || !body.trim()} className={primary}>
            {busy ? "Saving…" : `Save as ${staffName}`}
          </button>
          <button onClick={() => setStep("who")} className="text-sm text-[var(--color-ink-muted)] underline">Wrong student</button>
        </>
      )}

      {step === "saved" && person && (
        <>
          <p className="text-center text-5xl">✓</p>
          <p className="text-center text-lg text-[var(--color-navy-ink)]">Saved to {person.name.split(" ")[0]}&apos;s pathway.</p>
          <button onClick={reset} className={primary}>Capture another</button>
        </>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  );
}
