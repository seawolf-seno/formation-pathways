import { FELT_LABELS, FORMAT_LABELS, sparkUses, type SparkSession, type SparkUse } from "@/lib/sor/sparks";
import type { GeneratedPathway } from "@/lib/types";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const via = (s: SparkSession) => (s.source === "family_link" ? "at home, from a family link" : "in person, with a staff member");

/** A line under a spark: the pathways that grew from it, or that none did. */
function Uses({ uses }: { uses: SparkUse[] | null }) {
  if (!uses) return null;
  if (!uses.length) return <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">Not in a pathway in the latest draft</p>;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {uses.map((u, i) => (
        <li key={i} className="rounded bg-[var(--color-pacific-light)] px-1.5 py-0.5 text-[11px] text-[var(--color-navy-ink)]">
          → {u.pathway} <span className="text-[var(--color-ink-muted)]">· {u.where}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything a student shared in Spark, and how the latest pathway draft
 * used it, so staff can see the line from their words to a pathway. `draft`
 * is null when there isn't one, or when this role can't read drafts
 * (`canSeeDrafts`: admin and admissions only, under RLS).
 */
export function SparkResults({
  sessions,
  draft,
  canSeeDrafts,
  firstName,
}: {
  sessions: SparkSession[];
  draft: { pathways: GeneratedPathway[]; created_at: string; status: "draft" | "approved" } | null;
  canSeeDrafts: boolean;
  firstName: string;
}) {
  const newest = sessions[0];
  if (!newest) return null;
  // Only sessions saved before the draft could have shaped it.
  const usedBy = (s: SparkSession) => (draft && s.created_at <= draft.created_at ? draft.pathways : null);
  const trace = (s: SparkSession, text: string, short = false) => {
    const pathways = usedBy(s);
    return pathways ? sparkUses(text, pathways, { short }) : null;
  };

  const counted = draft
    ? sessions.filter(usedBy).flatMap((s) => [
        ...s.sparks.answers.map((a) => trace(s, a.text)),
        ...s.sparks.picks.map((p) => trace(s, p.label, true)),
        ...s.sparks.channels.map((c) => trace(s, c, true)),
      ])
    : [];
  const shaped = counted.filter((u) => u && u.length > 0).length;
  const afterDraft = draft ? sessions.filter((s) => s.created_at > draft.created_at) : [];

  let usage: string;
  if (!canSeeDrafts) {
    usage = `Admissions drafts ${firstName}'s pathways from these first, in ${firstName}'s own words. Drafts are visible to admissions and admins.`;
  } else if (!draft) {
    usage = `No pathways drafted yet. When they are, these sparks are weighed most heavily, ahead of the application and classes.`;
  } else if (afterDraft.length === sessions.length) {
    usage = `These came after the latest draft (${day(draft.created_at)}), so no pathway has used them yet. Draft again to use them.`;
  } else {
    usage =
      `The latest draft (${day(draft.created_at)}, ${draft.status === "approved" ? "signed" : "not yet signed"}) grew from ` +
      `${shaped} of ${counted.length} sparks; each one it used is marked below.` +
      (afterDraft.length ? ` ${afterDraft.length === 1 ? "One newer session isn't" : `${afterDraft.length} newer sessions aren't`} in it yet: draft again to use ${afterDraft.length === 1 ? "it" : "them"}.` : "");
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl bg-[var(--color-pacific-light)] p-3 text-[var(--color-navy-ink)]">
        <p className="font-semibold">
          ✓ {firstName} completed Spark {sessions.length === 1 ? "once" : `${sessions.length} times`} · latest {day(newest.created_at)}, {via(newest)}
        </p>
        <p className="mt-1 text-xs">{usage}</p>
      </div>

      {sessions.map((s, i) => {
        const body = (
          <div className="space-y-3">
            {s.sparks.answers.map((a) => (
              <blockquote key={a.prompt + a.text} className="rounded-xl border-l-4 border-[var(--color-gold)] bg-[var(--color-gold-light)] p-3">
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {a.prompt} <span className="whitespace-nowrap">· {a.via === "voice" ? "said aloud" : "typed"}</span>
                </p>
                <p className="mt-1 text-[var(--color-ink)]">&ldquo;{a.text}&rdquo;</p>
                <Uses uses={trace(s, a.text)} />
              </blockquote>
            ))}
            {s.sparks.picks.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Tapped (✦ twice: obsessed)</p>
                <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {[...s.sparks.picks].sort((a, b) => Number(b.obsessed) - Number(a.obsessed)).map((p) => (
                    <li key={p.label}>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${p.obsessed ? "bg-[var(--color-gold)] font-semibold" : "bg-[var(--color-gold-light)]"} text-[var(--color-navy-ink)]`}>
                        {p.obsessed ? "✦ " : ""}{p.label}
                      </span>
                      <Uses uses={trace(s, p.label, true)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.sparks.leanings.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">This or that</p>
                <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {s.sparks.leanings.map((l) => (
                    <li
                      key={l.a + l.b}
                      className={`rounded-full px-2.5 py-1 ${
                        l.choice ? "border border-[var(--color-border)]" : "border border-dashed border-[var(--color-border)]"
                      }`}
                    >
                      {l.choice ? (
                        <>
                          <b>{l.choice}</b>{" "}
                          <span className="text-[var(--color-ink-muted)]">over {l.choice === l.a ? l.b : l.a}</span>
                        </>
                      ) : (
                        // They said both. Show it as both, never as a blank or a side.
                        <>
                          <b>Both</b>{" "}
                          <span className="text-[var(--color-ink-muted)]">
                            {l.a} and {l.b}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.sparks.channels.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Channels they chose to share</p>
                <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {s.sparks.channels.map((c) => (
                    <li key={c}>
                      <span className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs">▶ {c}</span>
                      <Uses uses={trace(s, c, true)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
        const label = (
          <>
            {day(s.created_at)} · {via(s)}
            {s.sparks.format && <> · {FORMAT_LABELS[s.sparks.format]}</>}
            {s.sparks.lab?.feltLikeMe && <> · felt like them: {FELT_LABELS[s.sparks.lab.feltLikeMe].toLowerCase()}</>}
            {s.sparks.lab?.preferred && s.sparks.lab.comparedWith && (
              <>
                {" "}
                · preferred{" "}
                {s.sparks.lab.preferred === "same"
                  ? "neither"
                  : s.sparks.lab.preferred === "this"
                    ? `this over ${FORMAT_LABELS[s.sparks.lab.comparedWith].toLowerCase()}`
                    : FORMAT_LABELS[s.sparks.lab.comparedWith].toLowerCase()}
              </>
            )}
            {draft && s.created_at > draft.created_at && <span className="ml-2 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5">not in a draft yet</span>}
          </>
        );
        return i === 0 ? (
          <div key={s.created_at} className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-ink-muted)]">{label}</p>
            {body}
          </div>
        ) : (
          <details key={s.created_at} className="rounded-lg border border-[var(--color-border)] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-ink-muted)]">Earlier: {label}</summary>
            <div className="mt-3">{body}</div>
          </details>
        );
      })}

      <details className="text-xs text-[var(--color-ink-muted)]">
        <summary className="cursor-pointer font-semibold">How sparks are used</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Every session is combined when pathways are drafted, and weighed most heavily: ahead of the application, and far ahead of classes.</li>
          <li>Claude sees only {firstName}&apos;s first name and these words, and only with AI-drafting consent.</li>
          <li>Each pathway names what it grew from (&ldquo;grows from&rdquo; and the steps marked ✦); that is how the links above are found.</li>
          <li>Once a pathway is signed, {firstName} and family see &ldquo;grew from your spark&rdquo; on the steps that came from these words.</li>
        </ul>
      </details>
    </div>
  );
}
