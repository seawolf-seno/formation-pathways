"use client";

import { useState } from "react";
import {
  addCourseSkillAction,
  approveSkillSignalObservationAction,
  linkDriveDocAction,
  listAvailableDriveDocsAction,
  simulateCanvasActivityAction,
  syncCourseAction,
  updateCourseCanvasIdAction,
  type PendingSkillObservation,
} from "@/lib/actions";
import type {
  Course,
  CourseSkill,
  SkillSnapshot,
  Student,
} from "@/lib/types";
import type { DriveDoc } from "@/lib/integrations/drive";

export function SkillMatrix({
  course: initialCourse,
  skills: initialSkills,
  roster,
  initialSnapshots,
  canvasIsMocked,
}: {
  course: Course;
  skills: CourseSkill[];
  roster: Student[];
  initialSnapshots: SkillSnapshot[];
  canvasIsMocked: boolean;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [skills, setSkills] = useState(initialSkills);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [syncing, setSyncing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSkillObservation[]>([]);
  const [approvedKeys, setApprovedKeys] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ student: Student; skill: CourseSkill } | null>(
    null
  );
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveDocs, setDriveDocs] = useState<DriveDoc[] | null>(null);
  const [canvasIdInput, setCanvasIdInput] = useState(course.canvas_course_id ?? "");
  const [savingCanvasId, setSavingCanvasId] = useState(false);

  const snapshotFor = (studentId: number, skillId: number) =>
    snapshots.find((s) => s.student_id === studentId && s.skill_id === skillId);

  async function handleSync() {
    setSyncing(true);
    setLastMessage(null);
    try {
      const result = await syncCourseAction(course.id);
      setCourse(result.course);
      setSnapshots(result.snapshots);
      setPending(result.pendingObservations);
      setApprovedKeys(new Set());
    } finally {
      setSyncing(false);
    }
  }

  async function handleSimulate() {
    setSimulating(true);
    try {
      const result = await simulateCanvasActivityAction(course.id);
      setCourse(result.course);
      setSnapshots(result.snapshots);
      setPending(result.pendingObservations);
      setApprovedKeys(new Set());
      setLastMessage(result.message);
    } finally {
      setSimulating(false);
    }
  }

  async function handleAddSkill() {
    if (!skillName.trim()) return;
    const created = await addCourseSkillAction(course.id, skillName, skillDescription);
    setSkills((prev) => [...prev, created]);
    setSkillName("");
    setSkillDescription("");
    setShowSkillForm(false);
  }

  async function handleOpenDrivePicker() {
    setShowDrivePicker(true);
    if (!driveDocs) setDriveDocs(await listAvailableDriveDocsAction());
  }

  async function handleLinkDoc(fileId: string) {
    const updated = await linkDriveDocAction(course.id, fileId);
    setCourse(updated);
    setShowDrivePicker(false);
  }

  async function handleApprove(obs: PendingSkillObservation, key: string) {
    await approveSkillSignalObservationAction(obs);
    setApprovedKeys((prev) => new Set(prev).add(key));
  }

  async function handleSaveCanvasId() {
    setSavingCanvasId(true);
    try {
      const updated = await updateCourseCanvasIdAction(course.id, canvasIdInput);
      setCourse(updated);
    } finally {
      setSavingCanvasId(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-1 font-semibold ${
              canvasIsMocked
                ? "bg-[var(--color-border)] text-[var(--color-ink-muted)]"
                : "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]"
            }`}
          >
            {canvasIsMocked ? "Mock Canvas data" : "Live Canvas configured"}
          </span>
          <label className="text-[var(--color-ink-muted)]">Canvas course ID:</label>
          <input
            value={canvasIdInput}
            onChange={(e) => setCanvasIdInput(e.target.value)}
            placeholder="e.g. 12345"
            className="w-24 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
          />
          <button
            onClick={handleSaveCanvasId}
            disabled={savingCanvasId}
            className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-ink-muted)] disabled:opacity-40"
          >
            {savingCanvasId ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="text-xs text-[var(--color-ink-muted)]">
          {course.drive_doc_name ? (
            <span>
              Linked doc: <strong>{course.drive_doc_name}</strong>
            </span>
          ) : (
            <span>No Drive doc linked yet.</span>
          )}
          {course.last_synced_at && (
            <span>
              {" "}
              · last synced {new Date(course.last_synced_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenDrivePicker}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)]"
          >
            {course.drive_doc_name ? "Change linked doc" : "Link Drive doc"}
          </button>
          {canvasIsMocked && (
            <button
              onClick={handleSimulate}
              disabled={simulating || skills.length === 0}
              className="rounded-lg border border-[var(--color-gold)] px-3 py-2 text-xs font-medium text-[var(--color-navy-ink)] disabled:opacity-40"
            >
              {simulating ? "Simulating…" : "🎲 Simulate Canvas activity"}
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || skills.length === 0}
            className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync from Canvas"}
          </button>
        </div>
      </div>

      {lastMessage && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-pacific-light)] px-4 py-2 text-xs text-[var(--color-navy-ink)]">
          {lastMessage} — synced and skill snapshots updated.
        </div>
      )}

      {showDrivePicker && (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <h3 className="mb-2 font-display text-sm text-[var(--color-navy-ink)]">
            Pick a Drive doc
          </h3>
          <ul className="space-y-2">
            {(driveDocs ?? []).map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => handleLinkDoc(d.id)}
                  className="text-left text-sm text-[var(--color-navy-ink)] underline"
                >
                  {d.name}
                </button>
              </li>
            ))}
            {driveDocs && driveDocs.length === 0 && (
              <li className="text-sm text-[var(--color-ink-muted)]">
                No docs available.
              </li>
            )}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-light)] p-4">
          <h3 className="mb-2 font-display text-sm text-[var(--color-navy-ink)]">
            Formation signals found in this sync
          </h3>
          <ul className="space-y-2">
            {pending.map((obs, i) => {
              const key = `${obs.studentId}:${i}`;
              const approved = approvedKeys.has(key);
              return (
                <li
                  key={key}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span>
                    <strong>{obs.studentName}:</strong> {obs.text}
                  </span>
                  <button
                    onClick={() => handleApprove(obs, key)}
                    disabled={approved}
                    className="whitespace-nowrap rounded-lg bg-[var(--color-navy)] px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {approved ? "Added to Pathway" : "Add to Pathway"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                Student
              </th>
              {skills.map((skill) => (
                <th
                  key={skill.id}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]"
                >
                  {skill.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((student) => (
              <tr key={student.id} className="border-b border-[var(--color-border)]">
                <td className="px-4 py-3 font-display text-[var(--color-navy-ink)]">
                  {student.name}
                </td>
                {skills.map((skill) => {
                  const snapshot = snapshotFor(student.id, skill.id);
                  return (
                    <td key={skill.id} className="px-4 py-3 align-top">
                      {snapshot ? (
                        <button
                          onClick={() => setOpen({ student, skill })}
                          className="text-left text-xs text-[var(--color-ink)] hover:text-[var(--color-navy-ink)] hover:underline"
                        >
                          {snapshot.narrative.slice(0, 60)}…
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          not synced
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {roster.length === 0 && (
              <tr>
                <td
                  colSpan={skills.length + 1}
                  className="px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]"
                >
                  No students enrolled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        {showSkillForm ? (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div>
              <label className="block text-xs text-[var(--color-ink-muted)]">
                Skill name
              </label>
              <input
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[var(--color-ink-muted)]">
                What does this skill mean, in plain language?
              </label>
              <input
                value={skillDescription}
                onChange={(e) => setSkillDescription(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleAddSkill}
              className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-xs font-medium text-white"
            >
              Add skill
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSkillForm(true)}
            className="text-sm text-[var(--color-navy-ink)] underline"
          >
            + Add a skill
          </button>
        )}
      </div>

      {open &&
        (() => {
          const snapshot = snapshotFor(open.student.id, open.skill.id);
          return (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
              onClick={() => setOpen(null)}
            >
              <div
                className="max-w-md rounded-xl bg-white p-5 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-display text-lg text-[var(--color-navy-ink)]">
                  {open.student.name} — {open.skill.name}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]">
                  {snapshot?.narrative}
                </p>
                {snapshot && snapshot.evidence.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink-muted)]">
                    {snapshot.evidence.map((e, i) => (
                      <li key={i}>
                        <strong>{e.label}</strong> ({e.source}) — {e.detail}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setOpen(null)}
                  className="mt-4 text-xs text-[var(--color-ink-muted)] underline"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
