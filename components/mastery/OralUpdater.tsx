"use client";

import { useState, useTransition } from "react";
import { useDictation } from "@/components/useDictation";
import { answerRequestAction, recordLevelAction } from "@/lib/mastery/actions";
import { LEVELS, type Level } from "@/lib/mastery/config";
import { LEVEL_STYLE } from "./levels";
import { StandardSelect, type StandardOption } from "./TeacherTools";

/**
 * The oral exam / observation updater, sized for a phone held during the
 * conversation: who, which standard, tap a level, optionally say a note.
 * Saving records the teacher's own judgment, which stands until newer
 * evidence comes in. Opened from a student's request, it also marks the
 * request done.
 */
export function OralUpdater({
  courseId,
  students,
  standards,
  scale,
  initialStudent,
  initialStandard,
  requestId,
}: {
  courseId: string;
  students: { id: string; name: string }[];
  standards: StandardOption[];
  scale: { level: Level; label: string; meaning: string }[];
  initialStudent?: string;
  initialStandard?: string;
  requestId?: string;
}) {
  const [student, setStudent] = useState(initialStudent ?? "");
  const [standard, setStandard] = useState(initialStandard ?? "");
  const [level, setLevel] = useState<Level | null>(null);
  const [source, setSource] = useState<"oral" | "observation">("oral");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [request, setRequest] = useState(requestId);
  const [pending, start] = useTransition();
  const dictation = useDictation(setNote);

  const save = () =>
    start(async () => {
      setError(null);
      const text = dictation.listening ? dictation.stop() : note;
      if (!student || !standard || !level) return setError("Pick the student, the standard and a level.");
      const res = await recordLevelAction({ courseId, personId: student, standardCode: standard, level, source, note: text });
      if (!res.ok) return setError(res.error);
      if (request) {
        await answerRequestAction({ courseId, requestId: request, status: "done", response: "Oral exam given." });
        setRequest(undefined);
      }
      const who = students.find((s) => s.id === student)?.name ?? "";
      setSaved(`${who}: ${scale.find((s) => s.level === level)?.label} on ${standard}.`);
      setLevel(null);
      setNote("");
    });

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Student</span>
        <select value={student} onChange={(e) => setStudent(e.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-3 text-base">
          <option value="" disabled>
            Who?
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Standard</span>
        <StandardSelect name="standard" options={standards} value={standard} onChange={setStandard} />
      </label>
      <div className="flex gap-2 text-sm">
        {(["oral", "observation"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            aria-pressed={source === s}
            className={`flex-1 rounded-xl border px-3 py-2 ${source === s ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white" : "border-[var(--color-border)] bg-white text-[var(--color-navy-ink)]"}`}
          >
            {s === "oral" ? "Oral exam" : "Observation"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LEVELS.map((l) => {
          const step = scale.find((s) => s.level === l)!;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              className={`min-h-20 rounded-2xl p-3 text-left ${LEVEL_STYLE[l].chip} ${level === l ? "outline outline-4 outline-offset-2 outline-[var(--color-gold)]" : ""}`}
            >
              <span className="block font-display text-lg">{step.label}</span>
              <span className="block text-xs opacity-80">{step.meaning}</span>
            </button>
          );
        })}
      </div>
      <div>
        <div className="flex items-end gap-2">
          <textarea
            value={dictation.listening && dictation.interim ? `${note} ${dictation.interim}` : note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="A note, optional (what they explained well, what to revisit)"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base"
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start(note))}
              className={`rounded-xl px-3 py-2 text-sm ${dictation.listening ? "bg-[var(--color-gold)] text-[var(--color-navy-ink)]" : "border border-[var(--color-border)] bg-white"}`}
            >
              {dictation.listening ? "Done" : "Speak"}
            </button>
          )}
        </div>
      </div>
      <button onClick={save} disabled={pending} className="w-full rounded-xl bg-[var(--color-navy)] px-4 py-3 text-base font-medium text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {error && <p className="rounded-lg bg-[var(--color-gold-light)] px-3 py-2 text-sm text-[var(--color-navy-ink)]">{error}</p>}
      {saved && !error && <p className="rounded-lg bg-[var(--color-pacific-light)] px-3 py-2 text-sm text-[var(--color-navy-ink)]">Saved. {saved}</p>}
    </div>
  );
}
