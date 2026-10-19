"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExtensionTokenAction,
  deleteCourseResourceAction,
  revokeExtensionTokenAction,
  setKhanSkillAction,
  tagResourceAction,
  pullCanvasObjectivesAction,
  listObjectiveAssignmentsAction,
  saveAssignmentObjectivesAction,
} from "@/lib/mastery/actions";
import type { AssignmentChoice } from "@/lib/mastery/canvas-outcomes";
import { button, field, quiet } from "./TeacherTools";

export interface WhereOption {
  value: string;
  label: string;
}

export interface KhanSkillView {
  id: string;
  title: string;
  unit: string;
  unitNumber: number | null;
  objective: string | null;
  suggestion: string | null;
}

/**
 * Sorting Khan Academy skills into the course's learning objectives: every
 * skill the extension has seen, by Khan unit, each with a dropdown of
 * objectives (a suggestion is marked). Once sorted, a skill's proficient or
 * mastered counts as evidence for that objective, and every student's level
 * on it shows in that objective's dropdown on the dashboard.
 */
export function KhanSortPanel({
  courseId,
  skills,
  groups,
  linked,
}: {
  courseId: string;
  skills: KhanSkillView[];
  groups: { title: string; standards: { code: string; title: string }[] }[];
  linked: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!skills.length)
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">
        No Khan skills yet. Put the Khan class code in Course settings, connect the browser extension (on the Mastery Hub
        page) and press <strong>Sync Khan now</strong> in it. Every skill shows up here to sort.
      </p>
    );
  const units = [...new Map(skills.map((s) => [`${s.unitNumber ?? ""}|${s.unit}`, s])).values()].map((s) => ({ key: `${s.unitNumber ?? ""}|${s.unit}`, title: s.unit, n: s.unitNumber }));
  const acceptAll = (list: KhanSkillView[]) =>
    start(async () => {
      setError(null);
      for (const s of list) {
        const res = await setKhanSkillAction(courseId, s.id, true, s.suggestion!);
        if (!res.ok) {
          setError(res.error);
          break;
        }
      }
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-ink-muted)]">
        {linked} Khan student{linked === 1 ? "" : "s"} linked to this roster · {skills.filter((s) => s.objective).length} of {skills.length} skills
        sorted. Every level is kept; proficient and mastered count toward the objective.
      </p>
      {units.map((u) => {
        const list = skills.filter((s) => `${s.unitNumber ?? ""}|${s.unit}` === u.key);
        const sorted = list.filter((s) => s.objective).length;
        const suggestable = list.filter((s) => !s.objective && s.suggestion);
        return (
          <details key={u.key} open={sorted < list.length} className="rounded-xl border border-[var(--color-border)] bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-[var(--color-navy-ink)]">{u.n ? `Khan unit ${u.n}: ` : ""}{u.title || "Khan skills"}</span>{" "}
                <span className="text-xs text-[var(--color-ink-muted)]">
                  · {sorted}/{list.length} sorted
                </span>
              </span>
              {suggestable.length > 0 && (
                <button type="button" disabled={pending} onClick={() => acceptAll(suggestable)} className={`${quiet} text-xs`}>
                  {pending ? "Sorting…" : `Use the ${suggestable.length} suggestion${suggestable.length === 1 ? "" : "s"}`}
                </button>
              )}
            </summary>
            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {list.map((s) => (
                <KhanSortRow key={s.id} courseId={courseId} skill={s} groups={groups} />
              ))}
            </ul>
          </details>
        );
      })}
      {error && <p className="text-sm text-[var(--color-navy-ink)]">{error}</p>}
    </div>
  );
}

function KhanSortRow({ courseId, skill, groups }: { courseId: string; skill: KhanSkillView; groups: { title: string; standards: { code: string; title: string }[] }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{skill.title}</span>
      <select
        value={skill.objective ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(null);
            const code = e.target.value;
            const res = await setKhanSkillAction(courseId, skill.id, Boolean(code), code);
            if (!res.ok) setError(res.error);
            router.refresh();
          })
        }
        className={`${field} w-auto max-w-sm text-xs ${skill.objective ? "" : "text-[var(--color-ink-muted)]"}`}
      >
        <option value="">{skill.suggestion ? "Not sorted (suggestion marked ★)" : "Not sorted"}</option>
        {groups.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.standards.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code === skill.suggestion ? "★ " : ""}
                {x.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && <span className="w-full text-xs text-[var(--color-navy-ink)]">{error}</span>}
    </li>
  );
}

/** Make (or refresh) the course's backbone from its Canvas Outcomes. */
export function CanvasObjectivesButton({ courseId, fromCanvas, hasCanvasId }: { courseId: string; fromCanvas: boolean; hasCanvasId: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <button
        disabled={pending || !hasCanvasId}
        className={button}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const res = await pullCanvasObjectivesAction(courseId);
            setMessage(res.ok ? `${res.objectives} objectives in ${res.units} units from Canvas. ${res.summary}` : res.error);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Reading Canvas…" : fromCanvas ? "Pull changes from Canvas" : "Use my Canvas learning objectives"}
      </button>
      {!hasCanvasId && <p className="text-xs text-[var(--color-ink-muted)]">Add the Canvas course id in Course settings first.</p>}
      {message && <p className="text-sm text-[var(--color-navy-ink)]">{message}</p>}
    </div>
  );
}

export interface TaggedView {
  id: string;
  title: string;
  url: string;
  kind: string;
  where: string;
  note: string | null;
}

/** What the teacher tagged for this course, and a box to tag a link here. */
export function TaggedResources({ courseId, tagged, where }: { courseId: string; tagged: TaggedView[]; where: WhereOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {tagged.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-white text-sm">
          {tagged.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline">
                  {t.title}
                </a>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {" "}
                  · {t.kind === "video" ? "Video" : t.kind} · {t.where}
                  {t.note ? ` · ${t.note}` : ""}
                </span>
              </span>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteCourseResourceAction(courseId, t.id);
                    router.refresh();
                  })
                }
                className="text-xs text-[var(--color-ink-muted)] underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Nothing tagged yet. Use the browser extension on any page, or paste a link here.</p>
      )}
      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            const res = await tagResourceAction(courseId, fd);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
        className="grid gap-2 sm:grid-cols-[1fr_1fr_14rem_auto]"
      >
        <input name="url" required placeholder="https://… (a YouTube video, a PhET sim, an article)" className={field} />
        <input name="title" placeholder="Title (YouTube fills its own)" className={field} />
        <select name="where" required defaultValue="" className={field}>
          <option value="" disabled>
            For…
          </option>
          {where.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <button disabled={pending} className={quiet}>
          {pending ? "Saving…" : "Tag"}
        </button>
        <input name="note" placeholder="Why it helps (optional; students see it)" maxLength={300} className={`${field} sm:col-span-4`} />
        {error && <p className="text-sm text-[var(--color-navy-ink)] sm:col-span-4">{error}</p>}
      </form>
    </div>
  );
}

export interface TokenView {
  hash: string;
  label: string;
  created: string;
  expires: string;
  lastUsed: string | null;
  revoked: boolean;
}

/** Connect the browser extension: a token shown once, revocable. */
export function ExtensionConnections({ tokens, hubUrl }: { tokens: TokenView[]; hubUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [label, setLabel] = useState("My Chrome");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {token ? (
        <div className="rounded-xl bg-[var(--color-gold-light)] p-3 text-sm text-[var(--color-navy-ink)]">
          <p className="font-medium">Paste this into the extension now. It won&apos;t be shown again.</p>
          <p className="mt-1 text-xs">Hub address: {hubUrl}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={token} onFocus={(e) => e.target.select()} className={`${field} font-mono text-xs`} />
            <button className={quiet} onClick={() => navigator.clipboard?.writeText(token)}>
              Copy
            </button>
          </div>
          <button className="mt-2 text-xs underline" onClick={() => setToken(null)}>
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={`${field} w-48`} aria-label="Which browser" />
          <button
            disabled={pending}
            className={button}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await createExtensionTokenAction(label);
                if (!res.ok) return setError(res.error);
                setToken(res.token);
                router.refresh();
              })
            }
          >
            {pending ? "Connecting…" : "Connect the extension"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-[var(--color-navy-ink)]">{error}</p>}
      {tokens.length > 0 && (
        <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-white text-sm">
          {tokens.map((t) => (
            <li key={t.hash} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                {t.label}{" "}
                <span className="text-xs text-[var(--color-ink-muted)]">
                  · since {t.created.slice(0, 10)} · {t.revoked ? "revoked" : `until ${t.expires.slice(0, 10)}`}
                  {t.lastUsed ? ` · last used ${t.lastUsed.slice(0, 10)}` : " · not used yet"}
                </span>
              </span>
              {!t.revoked && (
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await revokeExtensionTokenAction(t.hash);
                      router.refresh();
                    })
                  }
                  className="text-xs text-[var(--color-ink-muted)] underline"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * For teachers whose learning objectives are Canvas ASSIGNMENTS (graded for
 * mastery) rather than Outcomes: tick the assignments that are objectives and
 * the unit each belongs to. Suggestions are pre-ticked (names or assignment
 * groups that say "LO", "learning objective", "mastery"…), and units are read
 * from names ("LO 2.1", "Unit 2 …") or assignment groups.
 */
export function AssignmentObjectivesPicker({ courseId, hasCanvasId }: { courseId: string; hasCanvasId: boolean }) {
  const [choices, setChoices] = useState<AssignmentChoice[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number | null | undefined>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = () =>
    start(async () => {
      setMessage(null);
      const res = await listObjectiveAssignmentsAction(courseId);
      if (!res.ok) return setMessage(res.error);
      setChoices(res.choices);
      const now: Record<string, number | null> = {};
      if (res.current.length) for (const c of res.current) now[c.id] = c.unitNumber;
      else for (const c of res.choices) if (c.suggested) now[c.id] = c.unitNumber;
      setPicked(now);
    });

  const save = () =>
    start(async () => {
      setMessage(null);
      const picks = Object.entries(picked)
        .filter(([, u]) => u !== undefined)
        .map(([id, unitNumber]) => ({ id, unitNumber: unitNumber ?? null }));
      const res = await saveAssignmentObjectivesAction(courseId, picks);
      if (!res.ok) return setMessage(res.error);
      setMessage(`${res.objectives} objectives in ${res.units} units. ${res.summary}`);
      setChoices(null);
      router.refresh();
    });

  if (!choices)
    return (
      <div className="space-y-2">
        <button disabled={pending || !hasCanvasId} onClick={load} className={quiet}>
          {pending ? "Reading Canvas…" : "Pick objective assignments"}
        </button>
        <p className="text-xs text-[var(--color-ink-muted)]">
          If your learning objectives are Canvas assignments graded for mastery, pick them here. Each one&apos;s grade becomes
          that objective&apos;s Canvas score; your other assignments, Khan Academy and AP Classroom sort in underneath.
        </p>
        {message && <p className="text-sm text-[var(--color-navy-ink)]">{message}</p>}
      </div>
    );

  const groups = [...new Set(choices.map((c) => c.group))];
  const count = Object.values(picked).filter((u) => u !== undefined).length;
  const units = new Set(Object.values(picked).filter((u) => u !== undefined).map((u) => u ?? "none")).size;
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-white py-2">
        <button disabled={pending || !count} onClick={save} className={button}>
          {pending ? "Saving…" : `Use these ${count} as objectives`}
        </button>
        <span className="text-xs text-[var(--color-ink-muted)]">
          {count} ticked · {units} unit{units === 1 ? "" : "s"}
        </span>
        <button onClick={() => setChoices(null)} className="text-xs text-[var(--color-ink-muted)] underline">
          Cancel
        </button>
      </div>
      {groups.map((g) => {
        const list = choices.filter((c) => c.group === g);
        const ticked = list.filter((c) => picked[c.id] !== undefined).length;
        return (
          <details key={g} open={ticked > 0} className="rounded-xl border border-[var(--color-border)] bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-[var(--color-navy-ink)]">{g || "Assignments"}</span>{" "}
                <span className="text-xs text-[var(--color-ink-muted)]">
                  · {ticked}/{list.length} ticked
                </span>
              </span>
              <span className="flex gap-2 text-xs">
                <button type="button" className="underline" onClick={() => setPicked((p) => ({ ...p, ...Object.fromEntries(list.map((c) => [c.id, p[c.id] !== undefined ? p[c.id] : c.unitNumber])) }))}>
                  Tick all
                </button>
                <button type="button" className="underline" onClick={() => setPicked((p) => ({ ...p, ...Object.fromEntries(list.map((c) => [c.id, undefined])) }))}>
                  None
                </button>
              </span>
            </summary>
            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {list.map((c) => {
                const on = picked[c.id] !== undefined;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input type="checkbox" checked={on} onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked ? c.unitNumber : undefined }))} />
                      <span className={on ? "font-medium text-[var(--color-navy-ink)]" : "text-[var(--color-ink)]"}>{c.name}</span>
                      {c.points !== null && <span className="text-xs text-[var(--color-ink-muted)]">· {c.points} pts</span>}
                      {c.suggested && !on && <span className="text-xs text-[var(--color-gold)]">looks like an objective</span>}
                    </label>
                    {on && (
                      <select
                        value={picked[c.id] ?? ""}
                        onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.value === "" ? null : Number(e.target.value) }))}
                        className={`${field} w-auto text-xs`}
                        aria-label="Unit"
                      >
                        <option value="">No unit</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            Unit {n}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      {message && <p className="text-sm text-[var(--color-navy-ink)]">{message}</p>}
    </div>
  );
}
