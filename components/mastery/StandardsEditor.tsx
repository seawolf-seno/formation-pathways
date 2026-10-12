"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lookupVideoAction, saveStandardSetAction } from "@/lib/mastery/standards-actions";
import { button, field, quiet } from "./TeacherTools";

type RawRes = { kind: string; label: string; url: string };
type RawVid = { id: string; title: string; channel: string; topics?: string };
type RawStd = { code: string; title: string; aliases?: string[]; resources?: RawRes[]; videos?: RawVid[] };
type RawGroup = { code: string; title: string; unitNumber?: number | null; resources?: RawRes[]; videos?: RawVid[]; standards: RawStd[] };
type Raw = {
  key: string;
  slug: string;
  title: string;
  scale: { level: string; label: string; meaning: string }[];
  rules: { scoreThresholds: { extending: number; proficient: number; developing: number }; recent: number; decay: number; [k: string]: unknown };
  groups: RawGroup[];
  [k: string]: unknown;
};

const KINDS = [
  ["khan", "Khan Academy"],
  ["phet", "PhET"],
  ["openstax", "OpenStax"],
  ["ap_classroom", "AP Classroom"],
  ["other", "Other"],
] as const;
const small = "rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm";
const remove = "text-xs text-[var(--color-ink-muted)] underline";

/**
 * Edit a subject's standards in the hub: units and standards (with other
 * names, so Khan skill titles map), study links and YouTube videos per unit
 * or standard, what each level means, and the scoring rules. Saved whole
 * and checked on the server by the same parser as the built-in files.
 */
export function StandardsEditor({ initial, canEdit, note }: { initial: Raw; canEdit: boolean; note: string }) {
  const [raw, setRaw] = useState<Raw>(() => structuredClone(initial));
  const [json, setJson] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const edit = (fn: (d: Raw) => void) => {
    setRaw((r) => {
      const d = structuredClone(r);
      fn(d);
      return d;
    });
    setDirty(true);
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      let body = JSON.stringify(raw);
      if (json !== null) body = json;
      const res = await saveStandardSetAction(raw.key, body);
      if (!res.ok) return setMessage(res.error);
      if (json !== null) {
        setRaw(JSON.parse(json));
        setJson(null);
      }
      setDirty(false);
      setMessage("Saved. Every course using these standards now shows them.");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-ink-muted)]">{note}</p>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-canvas)] py-3">
        {canEdit && (
          <button onClick={save} disabled={pending || (!dirty && json === null)} className={button}>
            {pending ? "Saving…" : "Save standards"}
          </button>
        )}
        <button onClick={() => setJson(json === null ? JSON.stringify(raw, null, 2) : null)} className={quiet}>
          {json === null ? "Edit as JSON" : "Back to the form"}
        </button>
        {dirty && <span className="text-xs text-[var(--color-ink-muted)]">Unsaved changes</span>}
        {message && <span className="text-sm text-[var(--color-navy-ink)]">{message}</span>}
      </div>

      {json !== null ? (
        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setDirty(true);
          }}
          readOnly={!canEdit}
          rows={30}
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white p-3 font-mono text-xs"
        />
      ) : (
        <fieldset disabled={!canEdit} className="space-y-6">
          <section className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:grid-cols-3">
            <label className="text-xs text-[var(--color-ink-muted)]">
              Subject
              <input value={raw.title} onChange={(e) => edit((d) => void (d.title = e.target.value))} className={`${field} mt-1`} />
            </label>
            <label className="text-xs text-[var(--color-ink-muted)]">
              Default course address (/mastery/…)
              <input value={raw.slug} onChange={(e) => edit((d) => void (d.slug = e.target.value))} className={`${field} mt-1`} />
            </label>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Key: <code>{raw.key}</code> (fixed; courses point at it)
            </p>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">Levels</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {raw.scale.map((s, i) => (
                <div key={s.level} className="space-y-1">
                  <input value={s.label} onChange={(e) => edit((d) => void (d.scale[i].label = e.target.value))} className={field} aria-label={`${s.level} name`} />
                  <textarea value={s.meaning} onChange={(e) => edit((d) => void (d.scale[i].meaning = e.target.value))} rows={2} className={field} aria-label={`${s.level} meaning`} />
                </div>
              ))}
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-[var(--color-navy)]">Scoring rules</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                {(["extending", "proficient", "developing"] as const).map((k) => (
                  <label key={k} className="text-xs text-[var(--color-ink-muted)]">
                    {k[0].toUpperCase() + k.slice(1)} from (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={raw.rules.scoreThresholds[k]}
                      onChange={(e) => edit((d) => void (d.rules.scoreThresholds[k] = Number(e.target.value)))}
                      className={`${field} mt-1`}
                    />
                  </label>
                ))}
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Newest pieces that count
                  <input type="number" min={1} max={20} value={raw.rules.recent} onChange={(e) => edit((d) => void (d.rules.recent = Number(e.target.value)))} className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Older piece counts (0–1)
                  <input type="number" step={0.05} min={0.05} max={1} value={raw.rules.decay} onChange={(e) => edit((d) => void (d.rules.decay = Number(e.target.value)))} className={`${field} mt-1`} />
                </label>
              </div>
              <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Source weights and level words are under &quot;Edit as JSON&quot;.</p>
            </details>
          </section>

          {raw.groups.map((g, gi) => (
            <details key={gi} open={gi === 0} className="rounded-2xl border border-[var(--color-border)] bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-medium text-[var(--color-navy-ink)]">{g.title || "Untitled unit"}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {g.standards.length} standard{g.standards.length === 1 ? "" : "s"} · {(g.videos?.length ?? 0) + g.standards.reduce((n, s) => n + (s.videos?.length ?? 0), 0)} videos
                </span>
              </summary>
              <div className="space-y-4 border-t border-[var(--color-border)] p-4">
                <div className="grid gap-2 sm:grid-cols-[6rem_1fr_7rem_auto]">
                  <input value={g.code} onChange={(e) => edit((d) => void (d.groups[gi].code = e.target.value))} className={small} aria-label="Unit code" placeholder="U1" />
                  <input value={g.title} onChange={(e) => edit((d) => void (d.groups[gi].title = e.target.value))} className={small} aria-label="Unit title" placeholder="Unit 1 · Kinematics" />
                  <input
                    type="number"
                    value={g.unitNumber ?? ""}
                    onChange={(e) => edit((d) => void (d.groups[gi].unitNumber = e.target.value === "" ? null : Number(e.target.value)))}
                    className={small}
                    aria-label="Unit number"
                    placeholder="Unit #"
                  />
                  <span className="flex gap-2">
                    <button type="button" disabled={gi === 0} onClick={() => edit((d) => void d.groups.splice(gi - 1, 0, d.groups.splice(gi, 1)[0]))} className={remove}>
                      Up
                    </button>
                    <button type="button" onClick={() => edit((d) => void d.groups.splice(gi, 1))} className={remove}>
                      Remove unit
                    </button>
                  </span>
                </div>

                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--color-ink-muted)]">
                    <tr>
                      <th className="w-20 py-1">Code</th>
                      <th>Standard</th>
                      <th>Other names (comma between; e.g. Khan skill names)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {g.standards.map((s, si) => (
                      <tr key={si} className="align-top">
                        <td className="py-1 pr-2">
                          <input value={s.code} onChange={(e) => edit((d) => void (d.groups[gi].standards[si].code = e.target.value))} className={`${small} w-full`} aria-label="Code" />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={s.title} onChange={(e) => edit((d) => void (d.groups[gi].standards[si].title = e.target.value))} className={`${small} w-full`} aria-label="Title" />
                          <VideoList
                            label={`Videos for ${s.code || "this standard"}`}
                            videos={s.videos ?? []}
                            onChange={(v) => edit((d) => void (d.groups[gi].standards[si].videos = v))}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <AliasInput aliases={s.aliases ?? []} onChange={(a) => edit((d) => void (d.groups[gi].standards[si].aliases = a))} />
                        </td>
                        <td className="py-1">
                          <button type="button" onClick={() => edit((d) => void d.groups[gi].standards.splice(si, 1))} className={remove}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => edit((d) => void d.groups[gi].standards.push({ code: "", title: "", aliases: [], resources: [], videos: [] }))}
                  className={quiet}
                >
                  Add a standard
                </button>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Study links for this unit</p>
                    {(g.resources ?? []).map((r, ri) => (
                      <div key={ri} className="mb-1 grid grid-cols-[7rem_1fr] gap-1 sm:grid-cols-[7rem_1fr_1fr_auto]">
                        <select value={r.kind} onChange={(e) => edit((d) => void (d.groups[gi].resources![ri].kind = e.target.value))} className={small}>
                          {KINDS.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <input value={r.label} onChange={(e) => edit((d) => void (d.groups[gi].resources![ri].label = e.target.value))} className={small} placeholder="What it is" />
                        <input value={r.url} onChange={(e) => edit((d) => void (d.groups[gi].resources![ri].url = e.target.value))} className={small} placeholder="https://…" />
                        <button type="button" onClick={() => edit((d) => void d.groups[gi].resources!.splice(ri, 1))} className={remove}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => edit((d) => void (d.groups[gi].resources ??= []).push({ kind: "other", label: "", url: "https://" }))} className={quiet}>
                      Add a link
                    </button>
                  </div>
                  <VideoList label="Videos for the whole unit" videos={g.videos ?? []} onChange={(v) => edit((d) => void (d.groups[gi].videos = v))} open />
                </div>
              </div>
            </details>
          ))}
          <button
            type="button"
            onClick={() =>
              edit((d) => {
                const n = Math.max(0, ...d.groups.map((x) => x.unitNumber ?? 0)) + 1;
                d.groups.push({ code: `U${n}`, title: `Unit ${n}`, unitNumber: n, resources: [], videos: [], standards: [{ code: `${n}.1`, title: "", aliases: [], resources: [], videos: [] }] });
              })
            }
            className={quiet}
          >
            Add a unit
          </button>
        </fieldset>
      )}
    </div>
  );
}

function AliasInput({ aliases, onChange }: { aliases: string[]; onChange: (a: string[]) => void }) {
  const [text, setText] = useState(aliases.join(", "));
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(",").map((a) => a.trim()).filter(Boolean))}
      className={`${small} w-full`}
      aria-label="Other names"
      placeholder="newtons second law, net force"
    />
  );
}

function VideoList({ label, videos, onChange, open = false }: { label: string; videos: RawVid[]; onChange: (v: RawVid[]) => void; open?: boolean }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      setError(null);
      const res = await lookupVideoAction(link);
      if (!res.ok) return setError(res.error);
      if (videos.some((v) => v.id === res.id)) return setError("Already in the list.");
      onChange([...videos, { id: res.id, title: res.title, channel: res.channel }]);
      setLink("");
    });
  return (
    <details open={open || videos.length > 0} className="mt-1">
      <summary className="cursor-pointer text-xs text-[var(--color-navy)]">
        {label} ({videos.length})
      </summary>
      <ul className="mt-1 space-y-1">
        {videos.map((v, i) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 text-xs">
            <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline">
              {v.title}
            </a>
            <span className="text-[var(--color-ink-muted)]">{v.channel}</span>
            <input
              value={v.topics ?? ""}
              onChange={(e) => onChange(videos.map((x, j) => (j === i ? { ...x, topics: e.target.value || undefined } : x)))}
              placeholder="covers… (optional)"
              className={`${small} w-40 text-xs`}
            />
            <button type="button" disabled={i === 0} onClick={() => onChange([videos[i], ...videos.filter((_, j) => j !== i)])} className={remove}>
              First
            </button>
            <button type="button" onClick={() => onChange(videos.filter((_, j) => j !== i))} className={remove}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex gap-1">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link" className={`${small} flex-1 text-xs`} />
        <button type="button" onClick={add} disabled={pending || !link.trim()} className={`${small} text-xs`}>
          {pending ? "Checking…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-[var(--color-navy-ink)]">{error}</p>}
    </details>
  );
}
