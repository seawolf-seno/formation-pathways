"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExtensionTokenAction,
  deleteCourseResourceAction,
  revokeExtensionTokenAction,
  setKhanSkillAction,
  tagResourceAction,
} from "@/lib/mastery/actions";
import { button, field, quiet } from "./TeacherTools";

export interface WhereOption {
  value: string;
  label: string;
}

export interface KhanSkillView {
  id: string;
  title: string;
  unit: string;
  chosen: boolean;
  standard: string | null;
  suggestion: string | null;
}

/**
 * Khan Academy key skills: everything the extension has seen in the linked
 * Khan class, grouped by Khan unit. Up to three per unit count, each mapped
 * to a standard; only those, at proficient or mastered, become evidence.
 */
export function KhanSkillsPanel({
  courseId,
  skills,
  standards,
  linked,
}: {
  courseId: string;
  skills: KhanSkillView[];
  standards: { code: string; title: string }[];
  linked: number;
}) {
  const units = [...new Set(skills.map((s) => s.unit))];
  if (!skills.length)
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">
        No Khan skills yet. Put the Khan class code in Course settings, connect the browser extension (on the Mastery Hub
        page), and press <strong>Sync Khan now</strong> in it. The skills show up here to choose from.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-ink-muted)]">
        {linked} Khan student{linked === 1 ? "" : "s"} linked to this roster. Pick up to three key skills per unit and the standard
        each shows. Proficient counts as Proficient, Mastered as Extending; anything below isn&apos;t counted.
      </p>
      {units.map((unit) => {
        const list = skills.filter((s) => s.unit === unit);
        const chosen = list.filter((s) => s.chosen).length;
        return (
          <details key={unit} open={chosen > 0} className="rounded-xl border border-[var(--color-border)] bg-white">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <span className="font-medium text-[var(--color-navy-ink)]">{unit || "Khan skills"}</span>{" "}
              <span className="text-xs text-[var(--color-ink-muted)]">
                · {chosen}/3 key · {list.length} skills
              </span>
            </summary>
            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {list.map((s) => (
                <KhanSkillRow key={s.id} courseId={courseId} skill={s} standards={standards} full={chosen >= 3} />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

function KhanSkillRow({ courseId, skill, standards, full }: { courseId: string; skill: KhanSkillView; standards: { code: string; title: string }[]; full: boolean }) {
  const [standard, setStandard] = useState(skill.standard ?? skill.suggestion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (chosen: boolean, code = standard) =>
    start(async () => {
      setError(null);
      const res = await setKhanSkillAction(courseId, skill.id, chosen, code);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <label className="flex flex-1 items-center gap-2">
        <input type="checkbox" checked={skill.chosen} disabled={pending || (!skill.chosen && full)} onChange={(e) => save(e.target.checked)} />
        <span className={skill.chosen ? "font-medium text-[var(--color-navy-ink)]" : "text-[var(--color-ink)]"}>{skill.title}</span>
      </label>
      <select
        value={standard}
        onChange={(e) => {
          setStandard(e.target.value);
          if (skill.chosen) save(true, e.target.value);
        }}
        className={`${field} w-auto max-w-xs text-xs`}
      >
        <option value="">Standard…</option>
        {standards.map((x) => (
          <option key={x.code} value={x.code}>
            {x.code} {x.title}
            {x.code === skill.suggestion ? " (suggested)" : ""}
          </option>
        ))}
      </select>
      {error && <span className="w-full text-xs text-[var(--color-navy-ink)]">{error}</span>}
    </li>
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
