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

interface DroppedFile {
  name: string;
  text: string;
  preview: ExportPreview | null;
  error: string | null;
}

/**
 * The drop-in for reports downloaded from AP Classroom (or, until Khan
 * Academy arrives through Canvas, Khan or any gradebook). Drop several files
 * at once, for example every progress check from one unit. Each is read and
 * shown before anything is saved; one Save keeps them all. Files are read in
 * the browser and sent as text; only the evidence you save is kept.
 */
export function ExportDrop({ courseId, standards, paused }: { courseId: string; standards: StandardOption[]; paused: Record<string, boolean> }) {
  const [source, setSource] = useState("ap_classroom");
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [fallback, setFallback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const readAll = (list: { name: string; text: string }[], fb = fallback, src = source) =>
    start(async () => {
      setMessage(null);
      const out: DroppedFile[] = [];
      for (const f of list) {
        const res = await previewExportAction(courseId, src, f.text, fb);
        out.push({ ...f, preview: res.ok ? res.preview : null, error: res.ok ? null : res.error });
      }
      setFiles(out);
    });

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const picked: { name: string; text: string }[] = [];
    for (const file of Array.from(list).slice(0, 20)) {
      if (file.size > 900_000) {
        setMessage(`${file.name} is too big (900 KB at most). Export one class at a time.`);
        return;
      }
      picked.push({ name: file.name, text: await file.text() });
    }
    readAll(picked);
  }

  const ready = files.filter((f) => f.preview && f.preview.evidence > 0);
  const total = ready.reduce((n, f) => n + (f.preview?.evidence ?? 0), 0);
  const unmapped = [...new Set(files.flatMap((f) => f.preview?.unmappedTitles ?? []))];
  const unmatched = [...new Set(files.flatMap((f) => f.preview?.unmatched ?? []))];

  const save = () =>
    start(async () => {
      let saved = 0;
      const problems: string[] = [];
      for (const f of ready) {
        const res = await saveExportAction(courseId, source, f.text, fallback);
        if (res.ok) saved += res.saved;
        else problems.push(`${f.name}: ${res.error}`);
      }
      setMessage(
        (saved ? `Saved ${saved} new piece${saved === 1 ? "" : "s"} of evidence.` : "Nothing new: these results are already in.") +
          (problems.length ? ` Not saved: ${problems.join("; ")}` : ""),
      );
      setFiles([]);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            if (files.length) readAll(files, fallback, e.target.value);
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
          {files.length ? `Change files (${files.length})` : "Choose CSV exports…"}
          <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
        </label>
      </div>

      {pending && !files.length && <p className="text-sm text-[var(--color-ink-muted)]">Reading…</p>}

      {files.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 text-sm">
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.name} className="text-[var(--color-ink)]">
                <strong className="font-medium">{f.name}</strong>
                <span className="text-[var(--color-ink-muted)]">
                  {" "}
                  ·{" "}
                  {f.preview
                    ? `${f.preview.evidence} piece${f.preview.evidence === 1 ? "" : "s"} for ${f.preview.students} student${f.preview.students === 1 ? "" : "s"}`
                    : f.error}
                </span>
              </li>
            ))}
          </ul>
          {ready[0]?.preview?.sampleRows.length ? (
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
                {ready.flatMap((f) => f.preview!.sampleRows.slice(0, 3)).slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{r.student}</td>
                    <td className="pr-2">{r.title}</td>
                    <td className="pr-2">{r.standards}</td>
                    <td>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {unmapped.length > 0 && (
            <div className="rounded-lg bg-[var(--color-gold-light)] p-3">
              <p className="text-[var(--color-navy-ink)]">
                These name no standard, so they aren&apos;t counted unless you pick one for them: {unmapped.slice(0, 15).join("; ")}
              </p>
              <div className="mt-2 max-w-sm">
                <StandardSelect
                  name="fallback"
                  options={standards}
                  value={fallback}
                  required={false}
                  onChange={(v) => {
                    setFallback(v);
                    readAll(files, v);
                  }}
                />
              </div>
            </div>
          )}
          {unmatched.length > 0 && (
            <p className="text-[var(--color-ink-muted)]">
              Not on this course&apos;s roster (exact name or school email needed), so skipped: {unmatched.slice(0, 20).join("; ")}
            </p>
          )}
          <button onClick={save} disabled={pending || !total} className={button}>
            {pending ? "Working…" : `Save ${total} piece${total === 1 ? "" : "s"}${ready.length > 1 ? ` from ${ready.length} files` : ""}`}
          </button>
        </div>
      )}
      {message && <p className="text-sm text-[var(--color-ink-muted)]">{message}</p>}
    </div>
  );
}
