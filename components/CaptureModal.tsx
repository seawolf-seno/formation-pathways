"use client";

import { useEffect, useRef, useState } from "react";
import { draftObservationAction, saveObservationAction } from "@/lib/actions";
import { FORMATION_TAGS, type FormationTag, type SuggestedTag } from "@/lib/types";

// Minimal ambient types for the Web Speech API (not in default DOM lib types).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultLike[] & { length: number };
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type Step = "capture" | "review" | "saved";

export function CaptureModal({
  studentId,
  studentName,
  defaultAuthor,
  onClose,
}: {
  studentId: number;
  studentName: string;
  defaultAuthor: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("capture");
  const [rawText, setRawText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  });
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState(defaultAuthor);
  const [cleanText, setCleanText] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<FormationTag>>(new Set());
  const [disciplineFlag, setDisciplineFlag] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  const startedAt = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!speechSupported) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Impl) return;
    const recognition = new Impl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript + " ";
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) {
        setRawText((prev) => (prev ? prev + " " + finalChunk.trim() : finalChunk.trim()));
      }
      setInterim(interimChunk);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [speechSupported]);

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  }

  async function handleDraft() {
    const text = (rawText + " " + interim).trim();
    if (!text) return;
    setLoadingDraft(true);
    try {
      const result = await draftObservationAction(text);
      setCleanText(result.cleanText);
      setSuggestedTags(result.suggestedTags);
      setSelectedTags(new Set(result.suggestedTags.map((t) => t.tag)));
      setDisciplineFlag(result.disciplineFlag);
      setUsedFallback(result.usedFallback);
      setRawText(text);
      setStep("review");
    } finally {
      setLoadingDraft(false);
    }
  }

  function toggleTag(tag: FormationTag) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveObservationAction({
        studentId,
        author,
        rawText,
        cleanText,
        tags: Array.from(selectedTags),
        disciplineFlag,
      });
      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      setElapsedSeconds(seconds);
      setStep("saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-ink-muted)]">
              Capture a moment
            </p>
            <h2 className="font-display text-lg text-[var(--color-navy-ink)]">
              {studentName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {step === "capture" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-2">
                <button
                  onClick={toggleListening}
                  disabled={!speechSupported}
                  className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl text-white shadow-md transition ${
                    listening
                      ? "bg-[var(--color-gold)] animate-pulse"
                      : "bg-[var(--color-navy)]"
                  } ${!speechSupported ? "opacity-40" : "hover:opacity-90"}`}
                  aria-label={listening ? "Stop dictation" : "Start dictation"}
                >
                  🎙️
                </button>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {speechSupported
                    ? listening
                      ? "Listening… tap to stop"
                      : "Tap to dictate"
                    : "Voice dictation isn't available in this browser — use the text box below"}
                </p>
              </div>

              <textarea
                value={interim ? `${rawText} ${interim}`.trim() : rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="What did you notice? A sentence or two is plenty."
                rows={5}
                className="w-full rounded-lg border border-[var(--color-border)] p-3 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
              />

              <button
                onClick={handleDraft}
                disabled={loadingDraft || !(rawText + interim).trim()}
                className="w-full rounded-lg bg-[var(--color-navy)] py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {loadingDraft ? "Drafting…" : "Review & tag"}
              </button>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {disciplineFlag && (
                <div className="rounded-lg bg-[var(--color-gold-light)] p-3 text-sm text-[var(--color-navy-ink)]">
                  <p className="font-medium">A gentle check:</p>
                  <p>{disciplineFlag}</p>
                </div>
              )}
              {usedFallback && (
                <p className="text-xs text-[var(--color-ink-muted)]">
                  AI assist is offline right now — text was lightly cleaned locally; tags weren&apos;t suggested. Pick tags below if any apply.
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Observation
                </label>
                <textarea
                  value={cleanText}
                  onChange={(e) => setCleanText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--color-border)] p-3 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Formation tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {FORMATION_TAGS.map((tag) => {
                    const suggestion = suggestedTags.find((t) => t.tag === tag);
                    const selected = selectedTags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        title={suggestion?.rationale}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          selected
                            ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                            : "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {suggestedTags.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {suggestedTags.map((t) => (
                      <li key={t.tag} className="text-xs text-[var(--color-ink-muted)]">
                        <span className="font-medium text-[var(--color-navy-ink)]">{t.tag}:</span>{" "}
                        {t.rationale}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Your name
                </label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] p-2.5 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("capture")}
                  className="flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium text-[var(--color-ink-muted)]"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !cleanText.trim()}
                  className="flex-1 rounded-lg bg-[var(--color-gold)] py-2.5 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save to Pathway"}
                </button>
              </div>
            </div>
          )}

          {step === "saved" && (
            <div className="space-y-4 py-4 text-center">
              <p className="font-display text-xl text-[var(--color-navy-ink)]">
                Saved.
              </p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Captured in {elapsedSeconds} second{elapsedSeconds === 1 ? "" : "s"}.
              </p>
              <button
                onClick={onClose}
                className="rounded-lg bg-[var(--color-navy)] px-5 py-2.5 text-sm font-medium text-white"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
