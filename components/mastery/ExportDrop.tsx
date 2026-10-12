"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewExportAction, saveExportAction, type ExportPreview } from "@/lib/mastery/actions";
import { StandardSelect, button, field, quiet, type StandardOption } from "./TeacherTools";

const SOURCES = [
  { value: "ap_classroom", label: "AP Classroom" },
  { value: "khan", label: "Khan Academy" },
  { value: "other", label: "Another gradebook" },
];

/**
 * The drop-in for a report downloaded from AP Classroom, Khan Academy or any
 * gradebook. Two steps: read it and show exactly what would be saved, then
 * save. The file is read in the browser and sent as text; nothing is kept
 * except the evidence the teacher saves.
 */
export function ExportDrop({ courseId, standards, paused }: { courseId: string; standards: StandardOption[]; paused: Record<string, boolean> }) {
  const [source, setSource] = useState("ap_classroom");
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fallback, setFallback] = useState("");
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const read = (csv: string, fb = fallback) =>
    start(async () => {
      setMessage(null);
      const res = await previewExportAction(courseId, source, csv, fb);
      if (!res.ok) {
        setPreview(null);
        return setMessage(res.error);
      }
      setPreview(res.preview);
    });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 900_000) return setMessage("That file is too big (900 KB at most). Export one class at a time.");
    const csv = await file.text();
    setFileName(file.name);
    setText(csv);
    read(csv);
  }

  const save = () =>
    start(async () => {
      if (!text) return;
      const res = await saveExportAction(courseId, source, text, fallback);
      if (!res.ok) return setMessage(res.error);
      setMessage(res.saved ? `Saved ${res.saved} new piece${res.saved === 1 ? "" : "s"} of evidence.` : "Nothing new: this report's results are already in.");
      setPreview(null);
      setText(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
            setText(null);
          }}
          className={`${field} w-auto`}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value} disabled={paused[s.value]}>
              {s.label}
              {paused[s.value] ? " (paused)" : ""}
            </option>
          ))}
        </select>
        <label className={`${quiet} cursor-pointer`}>
          {fileName ? `Change file (${fileName})` : "Choose the CSV export…"}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {pending && !preview && <p className="text-sm text-[var(--color-ink-muted)]">Reading…</p>}

      {preview && (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 text-sm">
          <p className="text-[var(--color-ink)]">
            <strong>{preview.evidence}</strong> piece{preview.evidence === 1 ? "" : "s"} of evidence for <strong>{preview.students}</strong> student
            {preview.students === 1 ? "" : "s"}, from {preview.rows} result{preview.rows === 1 ? "" : "s"} in the file. Anything already saved is skipped.
          </p>
          {preview.sampleRows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="text-[var(--color-ink-muted)]">
                <tr>
                  <th className="py-1">Student</th>
                  <th>Assessment</th>
                  <th>Standard</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{r.student}</td>
                    <td className="pr-2">{r.title}</td>
                    <td className="pr-2">{r.standards}</td>
                    <td>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.unmappedTitles.length > 0 && (
            <div className="rounded-lg bg-[var(--color-gold-light)] p-3">
              <p className="text-[var(--color-navy-ink)]">
                These name no standard, so they aren&apos;t counted unless you pick one for them: {preview.unmappedTitles.join("; ")}
              </p>
              <div className="mt-2 max-w-sm">
                <StandardSelect
                  name="fallback"
                  options={standards}
                  value={fallback}
                  required={false}
                  onChange={(v) => {
                    setFallback(v);
                    if (text) read(text, v);
                  }}
                />
              </div>
            </div>
          )}
          {preview.unmatched.length > 0 && (
            <p className="text-[var(--color-ink-muted)]">
              Not on this course&apos;s roster (exact name or school email needed), so skipped: {preview.unmatched.join("; ")}
            </p>
          )}
          {preview.skipped.length > 0 && <p className="text-[var(--color-ink-muted)]">Cells that weren&apos;t a score or level, ignored: {preview.skipped.join("; ")}</p>}
          <button onClick={save} disabled={pending || !preview.evidence} className={button}>
            {pending ? "Saving…" : `Save ${preview.evidence} piece${preview.evidence === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      {message && <p className="text-sm text-[var(--color-ink-muted)]">{message}</p>}
    </div>
  );
}
