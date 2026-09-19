"use client";

import { useState } from "react";
import { draftPortraitAction } from "@/lib/actions";
import type { Portrait, PortraitType } from "@/lib/types";
import { PortraitEditor } from "./PortraitEditor";

function latestOf(portraits: Portrait[], type: PortraitType): Portrait | null {
  const matches = portraits.filter((p) => p.type === type);
  return matches[0] ?? null;
}

export function PortraitPanel({
  studentId,
  initialPortraits,
}: {
  studentId: number;
  initialPortraits: Portrait[];
}) {
  const [portraits, setPortraits] = useState(initialPortraits);
  const [openId, setOpenId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState<PortraitType | null>(null);

  const familyLatest = latestOf(portraits, "family");
  const admissionsLatest = latestOf(portraits, "admissions");
  const open = portraits.find((p) => p.id === openId) ?? null;

  async function handleDraft(type: PortraitType) {
    setLoading(type);
    try {
      const created = await draftPortraitAction(studentId, type);
      setPortraits((prev) => [created, ...prev]);
      setOpenId(created.id);
    } finally {
      setLoading(null);
    }
  }

  function updatePortraitInPlace(updated: Portrait) {
    setPortraits((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <PortraitCard
          title="Pathway Portrait"
          description="A warm one-page letter to parents, drafted from this student's Pathway."
          latest={familyLatest}
          loading={loading === "family"}
          onDraft={() => handleDraft("family")}
          onOpen={(id) => setOpenId(id)}
        />
        <PortraitCard
          title="Admissions story"
          description="Same evidence, anonymized into a 150-word transformation arc."
          latest={admissionsLatest}
          loading={loading === "admissions"}
          onDraft={() => handleDraft("admissions")}
          onOpen={(id) => setOpenId(id)}
        />
      </div>

      {open && (
        <PortraitEditor
          key={open.id}
          portrait={open}
          onClose={() => setOpenId(null)}
          onUpdate={updatePortraitInPlace}
        />
      )}
    </div>
  );
}

function PortraitCard({
  title,
  description,
  latest,
  loading,
  onDraft,
  onOpen,
}: {
  title: string;
  description: string;
  latest: Portrait | null;
  loading: boolean;
  onDraft: () => void;
  onOpen: (id: number | string) => void;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div>
        <h4 className="font-display text-base text-[var(--color-navy-ink)]">
          {title}
        </h4>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          {description}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onDraft}
          disabled={loading}
          className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {loading ? "Drafting…" : `Draft ${latest ? "new " : ""}${title.toLowerCase()}`}
        </button>
        {latest && (
          <button
            onClick={() => onOpen(latest.id)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)]"
          >
            {latest.signed_by ? "View signed" : "Open draft"}
          </button>
        )}
      </div>
    </div>
  );
}
