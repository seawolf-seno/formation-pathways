"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { stemAction, stemStudentAction, type StemActionResult } from "@/lib/sor/stem-actions";
import type { StemKind, StemMentor, StemProgram, StemWork } from "@/lib/stem";

export const StemPreviewContext = createContext(false);

export function StemForm({ operation, personId, token, children, submit = "Save", id }: { operation: string; personId?: string; token?: string; children?: React.ReactNode; submit?: string; id?: string }) {
  const [result, action, pending] = useActionState<StemActionResult | null, FormData>(token ? stemStudentAction : stemAction, null);
  const preview = useContext(StemPreviewContext);
  return <form action={action} className="stem-form">
    <input type="hidden" name={token ? "kind" : "operation"} value={operation} />
    {personId && <input type="hidden" name="person_id" value={personId} />}
    {token && <input type="hidden" name="token" value={token} />}
    {id && <input type="hidden" name="id" value={id} />}
    <fieldset disabled={pending || preview}>{children}<button className="stem-button" type="submit">{pending ? "Saving…" : submit}</button></fieldset>
    {result && <p className="stem-feedback" role={result.ok ? "status" : "alert"}>{result.ok ? result.message : result.error}</p>}
    {result?.ok && result.link && <div className="stem-link-result"><a href={result.link}>{result.link}</a><button type="button" className="stem-button secondary" onClick={async () => { try { await navigator.clipboard.writeText(result.link!); } catch { /* The selectable link remains available. */ } }}>Copy private link</button></div>}
  </form>;
}

export function Field({ name, label, value, required, type = "text", max = 3000, area = false, hint }: { name: string; label: string; value?: string | null; required?: boolean; type?: string; max?: number; area?: boolean; hint?: string }) {
  return <label className="stem-field"><span>{label}</span>{area ? <textarea name={name} defaultValue={value ?? ""} required={required} maxLength={max} rows={4} /> : <input name={name} type={type} defaultValue={value ?? ""} required={required} maxLength={max} />}{hint && <small>{hint}</small>}</label>;
}
export function SelectField({ name, label, value, options, required = true }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; required?: boolean }) {
  return <label className="stem-field"><span>{label}</span><select name={name} defaultValue={value ?? options[0]?.value} required={required}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
export function ApplicationFields({ member }: { member?: { interest: string; goal: string; availability: string } }) {
  return <><Field name="interest" label="What STEM question or idea are you curious about?" value={member?.interest} area required /><Field name="goal" label="What would you like to explore or make?" value={member?.goal} area required /><Field name="availability" label="When can you meet and work on your project?" value={member?.availability} max={1000} required /></>;
}
export function WorkForm({ personId, token, program, mentors, work, kind: initialKind = "project" }: { personId?: string; token?: string; program: StemProgram; mentors: Pick<StemMentor, "id" | "name" | "active">[]; work?: Partial<StemWork>; kind?: StemKind }) {
  const [kind, setKind] = useState<StemKind>(work?.kind ?? initialKind);
  const kinds: StemKind[] = token ? ["project", "evidence", "mentor"] : ["project", "meeting", "mentor", "evidence"];
  return <div className="stem-work-form">
    {!work && <label className="stem-field"><span>Add to the student&apos;s work</span><select value={kind} onChange={e => setKind(e.target.value as StemKind)}>{kinds.map(k => <option key={k} value={k}>{({ project: "Project", meeting: "Meeting notes", mentor: "Mentor or alumni introduction", evidence: "Requirement evidence", summary: "Summary" })[k]}</option>)}</select></label>}
    <StemForm key={`${kind}-${work?.id ?? "new"}`} operation={token ? kind : "work"} personId={personId} token={token} id={work?.id} submit={kind === "mentor" && token ? "Request an introduction" : work ? "Save changes" : "Add to STEM Scholars"}>
      {!token && <input type="hidden" name="kind" value={kind} />}
      {kind === "mentor" && <SelectField name="mentor_id" label="Mentor or alumni" value={work?.mentor_id ?? undefined} options={mentors.filter(m => m.active || m.id === work?.mentor_id).map(m => ({ value: m.id, label: m.name }))} />}
      {(kind !== "mentor" || !token) && <>
        <Field name="title" label={kind === "project" ? "Project title" : kind === "meeting" ? "Meeting title and date" : kind === "evidence" ? "Evidence title" : "Introduction title"} max={200} required value={work?.title} />
        {kind === "evidence" && <SelectField name="requirement" label="Which requirement does this support?" value={work?.requirement} options={program.requirements.map(r => ({ value: r, label: r }))} />}
        <Field name="body" label={kind === "meeting" ? "Staff meeting notes · kept private" : kind === "project" ? "Your question, approach, progress and what you are learning" : kind === "evidence" ? "Describe the work and what you learned" : "Staff introduction notes · kept private"} max={12000} area required={kind === "evidence"} value={work?.body} />
        <Field name="url" label="Project or evidence link" type="url" max={2000} value={work?.url} />
        <Field name="next_step" label="Next step · suitable to share with the student" max={2000} value={work?.next_step} />
        <div className="stem-form-grid"><Field name="due_date" label="Next step due" type="date" value={work?.due_date} /><SelectField name="status" label="Progress" value={work?.status} options={[{ value: "planned", label: kind === "mentor" ? "Introduction requested" : "Planned" }, { value: "active", label: kind === "mentor" ? "Introduced" : "In progress" }, { value: "completed", label: "Complete" }]} /></div>
      </>}
    </StemForm>
  </div>;
}
