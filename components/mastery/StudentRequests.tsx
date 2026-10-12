"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { studentRequestAction } from "@/lib/mastery/actions";
import { StandardSelect, button, field, type StandardOption } from "./TeacherTools";

/** A student's two asks: an oral exam on a standard, or "look at what I
 *  did" (a PhET lab, an OpenStax section, an AP Classroom report), with a
 *  link. Their teacher answers on the course page. */
export function StudentRequests({ courseId, standards }: { courseId: string; standards: StandardOption[] }) {
  const [kind, setKind] = useState<"oral_exam" | "evidence">("oral_exam");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
      <div className="mb-3 flex gap-2 text-sm">
        {(["oral_exam", "evidence"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setMessage(null);
              setError(null);
            }}
            className={`flex-1 rounded-xl border px-3 py-2 ${kind === k ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white" : "border-[var(--color-border)] bg-white text-[var(--color-navy-ink)]"}`}
          >
            {k === "oral_exam" ? "Ask for an oral exam" : "Send in my work"}
          </button>
        ))}
      </div>
      <form
        key={kind}
        action={(fd) =>
          start(async () => {
            setError(null);
            setMessage(null);
            fd.set("kind", kind);
            const res = await studentRequestAction(courseId, fd);
            if (!res.ok) return setError(res.error);
            setMessage(kind === "oral_exam" ? "Sent. Your teacher will set a time." : "Sent. Your teacher will look at it.");
            router.refresh();
          })
        }
        className="space-y-2"
      >
        <StandardSelect name="standard" options={standards} />
        {kind === "evidence" && <input name="link" placeholder="Link to it (https://…), if there is one" className={field} maxLength={500} />}
        <textarea
          name="message"
          rows={2}
          maxLength={1000}
          placeholder={kind === "oral_exam" ? "Anything your teacher should know (optional)" : "What did you do? (e.g. the PhET energy lab, all three challenges)"}
          className={field}
        />
        <button disabled={pending} className={button}>
          {pending ? "Sending…" : "Send"}
        </button>
        {message && <p className="text-sm text-[var(--color-ink-muted)]">{message}</p>}
        {error && <p className="rounded-lg bg-[var(--color-gold-light)] px-3 py-2 text-sm text-[var(--color-navy-ink)]">{error}</p>}
      </form>
    </div>
  );
}
