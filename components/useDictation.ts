"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { joinText, prefersShortSessions, readResults, type ResultLike } from "@/lib/dictation";

// Minimal ambient types for the Web Speech API (not in the default DOM lib types).
interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: Event & { results: ArrayLike<ResultLike> }) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function speechImpl(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noopSubscribe = () => () => {};
// Errors that mean "stop trying" rather than "nothing heard this time".
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

/**
 * Dictation into a text field. `onText` gets the whole text so far (what was
 * there when the mic started, plus everything heard), so callers just set
 * their state. On Android it listens one phrase at a time and restarts until
 * stop(), because Android's continuous mode repeats itself (lib/dictation.ts).
 */
export function useDictation(onText: (text: string) => void) {
  // false during SSR, real answer after hydration — no mismatch.
  const supported = useSyncExternalStore(noopSubscribe, () => Boolean(speechImpl()), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const on = useRef(false); // the user wants to be listening
  const base = useRef(""); // text before the current recognition session
  const latest = useRef(""); // text so far, including this session's finals
  const latestInterim = useRef("");
  const callback = useRef(onText);
  useEffect(() => {
    callback.current = onText;
  });

  useEffect(() => {
    const Impl = speechImpl();
    if (!Impl) return;
    const r = new Impl();
    r.continuous = !prefersShortSessions(navigator.userAgent);
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      const { final, interim: heard } = readResults(e.results);
      latest.current = joinText(base.current, final);
      latestInterim.current = heard;
      callback.current(latest.current);
      setInterim(heard);
    };
    r.onerror = (e) => {
      if (e.error && FATAL.has(e.error)) {
        on.current = false;
        setListening(false);
      }
    };
    r.onend = () => {
      if (on.current) {
        // A session ended on its own (Android after each phrase, or a pause):
        // keep what was heard and listen again.
        base.current = joinText(latest.current, latestInterim.current);
        latest.current = base.current;
        latestInterim.current = "";
        setInterim("");
        try {
          r.start();
          return;
        } catch {
          on.current = false;
        }
      }
      setListening(false);
    };
    rec.current = r;
    return () => {
      on.current = false;
      r.stop();
    };
  }, []);

  /** Start listening, appending to `currentText`. */
  function start(currentText: string) {
    if (!rec.current || on.current) return;
    base.current = currentText.trim();
    latest.current = base.current;
    latestInterim.current = "";
    on.current = true;
    setInterim("");
    try {
      rec.current.start();
      setListening(true);
    } catch {
      on.current = false;
    }
  }

  /** Stop listening; returns the full text, including anything still interim. */
  function stop(): string {
    on.current = false;
    rec.current?.stop();
    setListening(false);
    const full = joinText(latest.current, latestInterim.current);
    latestInterim.current = "";
    setInterim("");
    return full;
  }

  return { supported, listening, interim, start, stop };
}
