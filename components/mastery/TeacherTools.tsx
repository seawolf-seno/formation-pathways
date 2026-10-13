"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEvidenceAction,
  addToRosterAction,
  answerRequestAction,
  createCourseAction,
  deleteEvidenceAction,
  deleteSampleCourseAction,
  loadSampleCourseAction,
  removeFromRosterAction,
  setSourcePausedAction,
  setStudentAccountAction,
  syncCanvasAction,
  updateCourseSettingsAction,
} from "@/lib/mastery/actions";
import { EVIDENCE_SOURCES, LEVELS, SOURCE_LABELS, type Level } from "@/lib/mastery/config";

export const field = "w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
export const button = "rounded-xl bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60";
export const quiet = "rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-navy-ink)] disabled:opacity-60";
const errorText = "text-sm text-[var(--color-navy-ink)] bg-[var(--color-gold-light)] rounded-lg px-3 py-2";

export type StandardOption = { code: string; title: string; group: string };
const LEVEL_LABEL: Record<Level, string> = { beginning: "Beginning", developing: "Developing", proficient: "Proficient", extending: "Extending" };

export function StandardSelect({ name, options, value, onChange, required = true }: { name: string; options: StandardOption[]; value?: string; onChange?: (v: string) => void; required?: boolean }) {
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <select name={name} required={required} className={field} value={value} onChange={onChange && ((e) => onChange(e.target.value))} defaultValue={value === undefined ? "" : undefined}>
      <option value="" disabled>
        Pick a standard…
      </option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options.filter((o) => o.group === g).map((o) => (
            <option key={o.code} value={o.code}>
              {o.code} {o.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function DeleteEvidenceButton({ courseId, evidenceId }: { courseId: string; evidenceId: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!sure)
    return (
      <button type="button" onClick={() => setSure(true)} className="text-[11px] text-[var(--color-ink-muted)] underline">
        Remove
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-[11px]">
      Remove this? It stays in the log.
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteEvidenceAction(courseId, evidenceId);
            if (res.ok) router.refresh();
            setSure(false);
          })
        }
        className="font-medium text-[var(--color-navy)] underline"
      >
        Yes, remove
      </button>
      <button type="button" onClick={() => setSure(false)} className="underline">
        Keep
      </button>
    </span>
  );
}

export function AddEvidenceForm({ courseId, personId, standards }: { courseId: string; personId: string; standards: StandardOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          setSaved(false);
          const res = await addEvidenceAction(courseId, personId, fd);
          if (!res.ok) return setError(res.error);
          setSaved(true);
          router.refresh();
        })
      }
      className="grid gap-2 sm:grid-cols-2"
    >
      <StandardSelect name="standard" options={standards} />
      <select name="source" className={field} defaultValue="canvas">
        {EVIDENCE_SOURCES.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
      <input name="title" placeholder="What was it? (e.g. Unit 2 retake)" className={`${field} sm:col-span-2`} required maxLength={200} />
      <div className="flex items-center gap-2">
        <input name="score" inputMode="decimal" placeholder="Score" className={field} />
        <span className="text-sm text-[var(--color-ink-muted)]">out of</span>
        <input name="max" inputMode="decimal" placeholder="Total" className={field} />
      </div>
      <select name="level" className={field} defaultValue="">
        <option value="">…or a level</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABEL[l]}
          </option>
        ))}
      </select>
      <input name="link" placeholder="Link (https://…), optional" className={field} />
      <input name="note" placeholder="Note, optional" className={field} maxLength={2000} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className={button}>
          {pending ? "Saving…" : "Add evidence"}
        </button>
        {saved && <span className="text-sm text-[var(--color-ink-muted)]">Saved.</span>}
      </div>
      {error && <p className={`${errorText} sm:col-span-2`}>{error}</p>}
    </form>
  );
}

export interface InboxItem {
  id: string;
  student: string;
  personId: string;
  standard: string;
  kind: "oral_exam" | "evidence";
  message: string;
  link: string | null;
  status: string;
  response: string | null;
  when: string;
}

export function RequestInbox({ courseId, courseSlug, items }: { courseId: string; courseSlug: string; items: InboxItem[] }) {
  if (!items.length) return <p className="text-sm text-[var(--color-ink-muted)]">Nothing waiting. Students ask for oral exams and send in work from their own page.</p>;
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <RequestRow key={r.id} courseId={courseId} courseSlug={courseSlug} r={r} />
      ))}
    </ul>
  );
}

function RequestRow({ courseId, courseSlug, r }: { courseId: string; courseSlug: string; r: InboxItem }) {
  const [response, setResponse] = useState(r.response ?? "");
  const [level, setLevel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const answer = (status: string) =>
    start(async () => {
      setError(null);
      const res = await answerRequestAction({ courseId, requestId: r.id, status, response, level });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
      <p className="text-sm">
        <strong className="text-[var(--color-navy-ink)]">{r.student}</strong>{" "}
        <span className="text-[var(--color-ink-muted)]">
          {r.kind === "oral_exam" ? "asks for an oral exam on" : "sent in work for"} {r.standard} · {r.when}
          {r.status !== "open" && ` · ${r.status}`}
        </span>
      </p>
      {r.message && <p className="mt-1 text-sm text-[var(--color-ink)]">“{r.message}”</p>}
      {r.link && (
        <a href={r.link} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-[var(--color-navy)] underline">
          {r.link}
        </a>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Reply (e.g. Thursday at lunch)" className={`${field} max-w-xs`} maxLength={1000} />
        {r.kind === "oral_exam" ? (
          <>
            {r.status === "open" && (
              <button disabled={pending} onClick={() => answer("scheduled")} className={quiet}>
                Schedule
              </button>
            )}
            <a href={`/mastery/${courseSlug}/oral?student=${r.personId}&standard=${encodeURIComponent(r.standard)}&request=${r.id}`} className={quiet}>
              Give it now
            </a>
          </>
        ) : (
          <>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={`${field} w-auto`}>
              <option value="">Level it shows…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
            <button disabled={pending || !level} onClick={() => answer("accepted")} className={quiet}>
              Accept as evidence
            </button>
          </>
        )}
        <button disabled={pending} onClick={() => answer("declined")} className="text-sm text-[var(--color-ink-muted)] underline">
          Not now
        </button>
      </div>
      {error && <p className={`mt-2 ${errorText}`}>{error}</p>}
    </li>
  );
}

export interface RosterRow {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  isSample: boolean;
}

export function RosterPanel({ courseId, courseSlug, roster, addable }: { courseId: string; courseSlug: string; roster: RosterRow[]; addable: { id: string; name: string }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const notOn = addable.filter((p) => !roster.some((r) => r.id === p.id));
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-white">
        {roster.map((s) => (
          <AccountRow key={s.id} courseId={courseId} courseSlug={courseSlug} s={s} />
        ))}
        {!roster.length && <li className="p-4 text-sm text-[var(--color-ink-muted)]">No students yet.</li>}
      </ul>
      {notOn.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          <select multiple value={picked} onChange={(e) => setPicked([...e.target.selectedOptions].map((o) => o.value))} className={`${field} h-28 max-w-sm`}>
            {notOn.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            disabled={pending || !picked.length}
            className={quiet}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await addToRosterAction(courseId, picked);
                if (!res.ok) return setError(res.error);
                setPicked([]);
                router.refresh();
              })
            }
          >
            Add to the course
          </button>
          <p className="w-full text-xs text-[var(--color-ink-muted)]">
            Students from the pilot roster. A real student needs the Mastery Hub consent on file first.
          </p>
        </div>
      )}
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}

function AccountRow({ courseId, courseSlug, s }: { courseId: string; courseSlug: string; s: RosterRow }) {
  const [email, setEmail] = useState(s.email ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (value: string) =>
    start(async () => {
      setError(null);
      const res = await setStudentAccountAction(courseId, s.id, value);
      if (!res.ok) return setError(res.error);
      setEditing(false);
      router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <a href={`/mastery/${courseSlug}/students/${s.id}`} className="font-medium text-[var(--color-navy)] underline decoration-[var(--color-pacific)] underline-offset-2">
        {s.name}
      </a>
      {editing ? (
        <span className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student28@pacificachristian.org" className={`${field} w-64`} />
          <button disabled={pending} onClick={() => save(email)} className={quiet}>
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs underline">
            Cancel
          </button>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
          {s.email && s.active ? <>Signs in as {s.email}</> : s.email ? <>Sign-in off ({s.email})</> : <>No student sign-in</>}
          <button onClick={() => setEditing(true)} className="underline">
            {s.email ? "Change" : "Give a sign-in"}
          </button>
          {s.email && s.active && (
            <button disabled={pending} onClick={() => save("")} className="underline">
              Turn off
            </button>
          )}
          <RemoveFromRoster courseId={courseId} personId={s.id} />
        </span>
      )}
      {error && <p className={`w-full ${errorText}`}>{error}</p>}
    </li>
  );
}

function RemoveFromRoster({ courseId, personId }: { courseId: string; personId: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!sure)
    return (
      <button onClick={() => setSure(true)} className="underline">
        Remove
      </button>
    );
  return (
    <span>
      Their evidence stays.{" "}
      <button
        disabled={pending}
        className="font-medium underline"
        onClick={() =>
          start(async () => {
            await removeFromRosterAction(courseId, personId);
            router.refresh();
          })
        }
      >
        Remove from course
      </button>{" "}
      <button onClick={() => setSure(false)} className="underline">
        Keep
      </button>
    </span>
  );
}

export interface SourceRow {
  source: "canvas" | "ap_classroom" | "khan";
  label: string;
  paused: boolean;
  lastRun: string | null;
  summary: string | null;
}

export function SourceSwitch({ courseId, row }: { courseId: string; row: SourceRow }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setSourcePausedAction(courseId, row.source, !row.paused);
          router.refresh();
        })
      }
      className={quiet}
      aria-pressed={!row.paused}
    >
      {row.paused ? "Paused · turn on" : "On · pause"}
    </button>
  );
}

export function CanvasControls({ courseId, isSample, paused }: { courseId: string; isSample: boolean; paused: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <button
        disabled={pending || paused}
        className={button}
        onClick={() =>
          start(async () => {
            const res = await syncCanvasAction(courseId);
            setMessage(res.ok ? res.summary : res.error);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Checking Canvas…" : isSample ? "Check Canvas (sample)" : "Check Canvas now"}
      </button>
      {message && <p className="text-sm text-[var(--color-ink-muted)]">{message}</p>}
    </div>
  );
}

/** Address, Canvas course id, and how far the class has got. */
export function CourseSettings({
  courseId,
  slug,
  canvasCourseId,
  finishedThrough,
  units,
  isSample,
  khanClassCode = null,
}: {
  courseId: string;
  slug: string;
  canvasCourseId: string | null;
  khanClassCode?: string | null;
  finishedThrough: number | null;
  units: { number: number; title: string }[];
  isSample: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      action={(fd) =>
        start(async () => {
          setMessage(null);
          const res = await updateCourseSettingsAction(courseId, fd);
          if (!res.ok) return setMessage(res.error);
          setMessage("Saved.");
          if (res.slug !== slug) router.replace(`/mastery/${res.slug}`);
          else router.refresh();
        })
      }
      className="grid gap-3 sm:grid-cols-3"
    >
      <label className="text-xs text-[var(--color-ink-muted)]">
        The class has finished
        <select name="finished_through" defaultValue={finishedThrough ?? ""} className={`${field} mt-1`}>
          <option value="">Not set</option>
          {units.map((u) => (
            <option key={u.number} value={u.number}>
              Through {u.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-[var(--color-ink-muted)]">
        Address: /mastery/…
        <input name="slug" defaultValue={slug} required maxLength={40} className={`${field} mt-1`} />
      </label>
      <label className="text-xs text-[var(--color-ink-muted)]">
        Canvas course id
        <input name="canvas_course_id" defaultValue={canvasCourseId ?? ""} inputMode="numeric" disabled={isSample} placeholder={isSample ? "Sample: none" : "From the Canvas address"} className={`${field} mt-1`} />
      </label>
      <label className="text-xs text-[var(--color-ink-muted)]">
        Khan Academy class code
        <input name="khan_class_code" defaultValue={khanClassCode ?? ""} maxLength={12} placeholder="e.g. 7PZVAQDF" className={`${field} mt-1 uppercase`} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button disabled={pending} className={quiet}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && <span className="text-sm text-[var(--color-ink-muted)]">{message}</span>}
      </div>
    </form>
  );
}

export function NewCourseForm({ configs }: { configs: { key: string; title: string; slug: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(configs[0]?.key ?? "");
  const [pending, start] = useTransition();
  const slug = configs.find((c) => c.key === key)?.slug ?? "";
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await createCourseAction(fd);
          if (res && !res.ok) setError(res.error);
        })
      }
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_9rem_auto]"
    >
      <input name="title" required maxLength={120} placeholder="Course name (e.g. AP Physics 1)" className={field} />
      <select name="config_key" className={field} value={key} onChange={(e) => setKey(e.target.value)}>
        {configs.map((c) => (
          <option key={c.key} value={c.key}>
            Standards: {c.title}
          </option>
        ))}
      </select>
      <input key={slug} name="slug" defaultValue={slug} maxLength={40} placeholder="Address, e.g. APPhysics1" aria-label="Address: /mastery/…" className={field} />
      <input name="canvas_course_id" inputMode="numeric" placeholder="Canvas course id" className={field} />
      <button disabled={pending} className={button}>
        {pending ? "Creating…" : "Create"}
      </button>
      {error && <p className={`${errorText} sm:col-span-2 lg:col-span-5`}>{error}</p>}
    </form>
  );
}

export function SampleCourseButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        disabled={pending}
        className={quiet}
        onClick={() =>
          start(async () => {
            const res = await loadSampleCourseAction();
            if (res && !res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Building the sample class…" : "Load a sample AP Physics 1 class"}
      </button>
      {error && <p className={`mt-2 ${errorText}`}>{error}</p>}
    </div>
  );
}

export function DeleteSampleCourse({ courseId }: { courseId: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure)
    return (
      <button onClick={() => setSure(true)} className="text-xs text-[var(--color-ink-muted)] underline">
        Delete this sample course
      </button>
    );
  return (
    <span className="text-xs text-[var(--color-ink-muted)]">
      Delete it and its fictional evidence?{" "}
      <button disabled={pending} onClick={() => start(async () => void (await deleteSampleCourseAction(courseId)))} className="font-medium underline">
        Delete
      </button>{" "}
      <button onClick={() => setSure(false)} className="underline">
        Keep
      </button>
    </span>
  );
}
