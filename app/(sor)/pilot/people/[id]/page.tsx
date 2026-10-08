import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonProfile, getRoster, logAccess, requireStaff } from "@/lib/sor/queries";
import { describeSent, pathwayInput } from "@/lib/sor/ai-input";
import { SentToAi } from "@/components/sor/SentToAi";
import { displayName } from "@/lib/sor/types";
import { PathwaysDisplay } from "@/components/PathwaysDisplay";
import { TagChip } from "@/components/TagChips";
import { SparkResults } from "@/components/sor/SparkResults";
import { ApproveButton, ConsentPanel, DraftButton, EditPathwaysPanel, ExternalIdsPanel, SparkLinkButton, WithdrawButton } from "@/components/sor/PersonControls";

/** A small labeled fact chip: grade, class year, advisor. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{label}</span>
      <span className="font-display text-base text-[var(--color-navy-ink)]">{value}</span>
    </span>
  );
}

/** Course chip color by Blackbaud offering type. Color is never the only cue: the title says it. */
function offeringStyle(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("art")) return "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]";
  if (t.includes("athlet") || t.includes("activit") || t.includes("sport")) return "bg-[var(--color-navy)] text-white";
  return "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]";
}

function Section({ title, source, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-[var(--color-navy-ink)]">{title}</h2>
        {source && <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{source}</span>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-[var(--color-ink-muted)]">{children}</p>
);

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff();
  const profile = await getPersonProfile(id);
  if (!profile) notFound();
  await logAccess(staff, "view_person", id);

  const { person, admissions, enrollment, courses, classHistory, evidence, observations, drafts, consents, sparks } = profile;
  const voiceConsent = person.is_sample || consents.some((c) => c.scope === "student_voice" && !c.revoked_at);
  const name = displayName(person);
  const isAdmin = staff.role === "admin";
  const canDraft = staff.role === "admin" || staff.role === "admissions";
  // RLS: student_sparks is readable by admin, admissions and teacher only.
  const canReadSparks = canDraft || staff.role === "teacher";
  const aiConsent = person.is_sample || consents.some((c) => c.scope === "ai_drafting" && !c.revoked_at);
  const latest = drafts[0];
  // What a draft would send, for staff to check (names removed).
  let sentToAi: ReturnType<typeof describeSent> | null = null;
  if (canDraft && aiConsent) {
    const { input, anon } = pathwayInput(profile, await getRoster(), staff.display_name);
    sentToAi = describeSent(input, anon);
  }
  const courseName = new Map(courses.map((c) => [c.canvas_course_id, c.course_name]));
  const comments = evidence.filter((e) => e.teacher_comment);
  const historyYears = [...new Set(classHistory.map((h) => h.school_year))];
  const canvasOnly = courses.filter((c) => !classHistory.some((h) => h.course_title === c.course_name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/pilot" className="text-xs text-[var(--color-ink-muted)] hover:underline">← Pilot roster</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">{name}</h1>
          <p className="text-sm capitalize text-[var(--color-ink-muted)]">
            {person.stage}
            {enrollment?.grade ? ` · Grade ${enrollment.grade}` : person.current_grade ? ` · Grade ${person.current_grade}` : ""}
            {person.grad_year ? ` · Class of ${person.grad_year}` : ""}
            {enrollment?.advisor_name ? ` · Advisor ${enrollment.advisor_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReadSparks && (
            <a
              href="#spark"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${sparks.length ? "bg-[var(--color-gold)] text-[var(--color-navy-ink)]" : "border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"}`}
            >
              {sparks.length
                ? `✦ Spark done · ${new Date(sparks[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : "No Spark yet"}
            </a>
          )}
          {person.is_sample && (
            <span className="rounded bg-[var(--color-gold-light)] px-2 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
              Fictional sample
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div id="spark" className="scroll-mt-6">
            <Section title="What lights them up" source="Spark, in their words">
              {!canReadSparks ? (
                <Empty>Spark results are visible to teachers, admissions and admins.</Empty>
              ) : sparks.length > 0 ? (
                <div className="space-y-3">
                  <SparkResults
                    sessions={sparks}
                    draft={canDraft && latest ? latest : null}
                    canSeeDrafts={canDraft}
                    firstName={person.preferred_name || person.first_name}
                  />
                  {voiceConsent && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/pathway/${person.id}/spark`} className="font-semibold underline">Start another Spark conversation →</Link>
                      <Link href={`/pathway/${person.id}/spark?format=classic`} className="text-xs underline">one format only</Link>
                      <SparkLinkButton personId={person.id} firstName={person.preferred_name || person.first_name} />
                    </div>
                  )}
                </div>
              ) : voiceConsent ? (
                <div className="space-y-3">
                  <p className="rounded-xl bg-[var(--color-canvas)] p-3 text-sm font-semibold text-[var(--color-navy-ink)]">
                    {person.preferred_name || person.first_name} hasn&apos;t done Spark yet.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      Applications show the formal version of a student. Sit with {person.preferred_name || person.first_name} and let them light up what they really love, or send a one-time link to do it at home.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/pathway/${person.id}/spark`} className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white">
                        Start a Spark conversation ✦
                      </Link>
                      <Link href={`/pathway/${person.id}/spark?format=classic`} className="self-center text-xs underline">
                        one format only
                      </Link>
                      <SparkLinkButton personId={person.id} firstName={person.preferred_name || person.first_name} />
                    </div>
                  </div>
                </div>
              ) : (
                <Empty>No Spark yet. It needs student-voice consent (Consent box) first.</Empty>
              )}
            </Section>
          </div>
          <Section title="Where they've been" source="Finalsite">
            {!admissions ? (
              <Empty>{canDraft ? "No admissions data imported yet." : "Admissions files are visible to the admissions office."}</Empty>
            ) : (
              <div className="space-y-4 text-sm">
                <p className="text-[var(--color-ink-muted)]">
                  {admissions.previous_school && <>From {admissions.previous_school}. </>}
                  {admissions.entry_year && <>Entering {admissions.entry_year}{admissions.entering_grade ? `, grade ${admissions.entering_grade}` : ""}. </>}
                  {admissions.application_status && <>Status: {admissions.application_status}.</>}
                </p>
                {(admissions.interests.length > 0 || admissions.activities.length > 0) && (
                  <p>
                    {[...admissions.interests, ...admissions.activities].map((x) => (
                      <span key={x} className="mb-1 mr-1 inline-block rounded-full bg-[var(--color-canvas)] px-2.5 py-1 text-xs">{x}</span>
                    ))}
                  </p>
                )}
                {admissions.responses.map((r) => (
                  <blockquote key={r.question} className="border-l-2 border-[var(--color-gold)] pl-3">
                    <p className="text-xs text-[var(--color-ink-muted)]">{r.question}</p>
                    <p className="mt-1 italic text-[var(--color-ink)]">&ldquo;{r.answer}&rdquo;</p>
                  </blockquote>
                ))}
              </div>
            )}
          </Section>


          <Section title="Where they are now" source="Blackbaud · Canvas">
            {courses.length === 0 && classHistory.length === 0 && !enrollment ? (
              <Empty>Not enrolled yet, or no enrollment data imported.</Empty>
            ) : (
              <div className="space-y-5 text-sm">
                {enrollment && (
                  <div className="flex flex-wrap gap-2">
                    {enrollment.grade != null && <Fact label="Grade" value={String(enrollment.grade)} />}
                    {enrollment.grad_year != null && <Fact label="Class of" value={String(enrollment.grad_year)} />}
                    {enrollment.advisor_name && <Fact label="Advisor" value={enrollment.advisor_name} />}
                    {enrollment.enrolled_since && <Fact label="At Pacifica since" value={enrollment.enrolled_since.slice(0, 4)} />}
                  </div>
                )}
                {historyYears.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {historyYears.map((year) => (
                      <div key={year} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{year}</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {classHistory
                            .filter((h) => h.school_year === year)
                            .map((h) => (
                              <li
                                key={h.section_id}
                                title={h.offering_type ?? undefined}
                                className={`rounded-full px-2.5 py-1 text-xs ${offeringStyle(h.offering_type)}`}
                              >
                                {h.course_title}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {historyYears.length > 0 && (
                  <p className="flex flex-wrap gap-3 text-[11px] text-[var(--color-ink-muted)]">
                    <span className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-full ${offeringStyle("Academics")}`} /> Academics</span>
                    <span className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-full ${offeringStyle("Arts")}`} /> Arts</span>
                    <span className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-full ${offeringStyle("Athletics")}`} /> Athletics &amp; activities</span>
                  </p>
                )}
                {canvasOnly.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {canvasOnly.map((c) => (
                      <li key={c.canvas_course_id} className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-navy-ink)]">
                        {c.course_name}
                        {c.teacher_name ? <span className="text-[var(--color-ink-muted)]"> · {c.teacher_name}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {comments.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {comments.map((e) => (
                      <blockquote key={e.id} className="rounded-xl border-l-4 border-[var(--color-pacific)] bg-[var(--color-pacific-light)] p-4">
                        <p className="text-[var(--color-ink)]">&ldquo;{e.teacher_comment}&rdquo;</p>
                        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{courseName.get(e.canvas_course_id)} · {e.assignment_name}</p>
                      </blockquote>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="What staff have seen" source="Voice & text capture">
            {observations.length === 0 ? (
              <Empty>No observations yet. Any staff member can add one from <Link href="/capture" className="underline">Capture</Link>.</Empty>
            ) : (
              <ul className="space-y-3 text-sm">
                {observations.map((o) => (
                  <li key={o.id}>
                    <p className="text-[var(--color-ink)]">{o.body}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-ink-muted)]">
                      {o.author_name} · {o.created_at.slice(0, 10)} · {o.source}
                      {o.tags.map((t) => <TagChip key={t} tag={t} />)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canDraft && (
            <section className="rounded-xl border-2 border-dashed border-[var(--color-gold)] bg-[var(--color-gold-light)] p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-[var(--color-navy-ink)]">Who {person.preferred_name || person.first_name} is today, and roads to Ruakh 2.0</h2>
                  <p className="text-xs text-[var(--color-ink-muted)]">Drafted from everything above. Staff only until a named adult edits and signs it; then the pathways you keep (never this portrait) can be opened with the student. Six are drafted so you can remove the ones that aren&apos;t unmistakably theirs.</p>
                </div>
                <DraftButton personId={person.id} hasDraft={Boolean(latest)} allowed={aiConsent} />
              </div>
              {sentToAi && <div className="mb-4"><SentToAi {...sentToAi} /></div>}
              {latest && (
                <div className="space-y-6">
                  <div className="relative rounded-xl bg-white p-5">
                    <span className="absolute right-4 top-3 text-xs font-bold uppercase tracking-[0.3em] text-[var(--color-gold)]">
                      {latest.status === "approved" ? "Approved" : "Draft"}
                    </span>
                    {latest.used_fallback && (
                      <p className="mb-3 rounded bg-[var(--color-gold-light)] px-3 py-2 text-xs text-[var(--color-navy-ink)]">
                        AI assist is offline (no API key). This is a template, not a real synthesis.
                      </p>
                    )}
                    {latest.portrait.split(/\n\n+/).map((para, i) => (
                      <p key={i} className="mb-3 text-sm leading-relaxed text-[var(--color-ink)]">{para}</p>
                    ))}
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      Sources: {latest.sources_used.join(", ") || "none"} · drafted {latest.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <PathwaysDisplay applicantName={name} generated={{ pathways: latest.pathways, seedObservations: [] }} />
                  <div className="text-center">
                    {latest.status === "approved" ? (
                      <p className="text-sm text-[var(--color-navy-ink)]">
                        Reviewed and signed by {latest.approved_by}, {latest.approved_at?.slice(0, 10)}.{" "}
                        <Link href={`/pathway/${person.id}`} className="font-semibold underline">
                          Open it with {person.preferred_name || person.first_name} →
                        </Link>
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <EditPathwaysPanel key={latest.id} draftId={latest.id} personId={person.id} pathways={latest.pathways} />
                        <div>
                          <ApproveButton draftId={latest.id} personId={person.id} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {!person.is_sample && (
            <Section title="Consent">
              <ConsentPanel personId={person.id} consents={consents} isAdmin={isAdmin} />
            </Section>
          )}
          {(profile.externalIds.length > 0 || (isAdmin && !person.is_sample)) && (
            <Section title="Linked systems">
              <ExternalIdsPanel personId={person.id} ids={profile.externalIds} editable={isAdmin && !person.is_sample} />
            </Section>
          )}
          {isAdmin && <WithdrawButton personId={person.id} name={name} />}
        </aside>
      </div>
    </div>
  );
}
