"use client";

import { useState } from "react";
import { CaptureModal } from "./CaptureModal";

export function StudentPageCapture({
  studentId,
  studentName,
}: {
  studentId: number;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        🎙️ Capture a moment
      </button>
      {open && (
        <CaptureModal
          studentId={studentId}
          studentName={studentName}
          defaultAuthor=""
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
