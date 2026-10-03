import Link from "next/link";
import { redirect } from "next/navigation";
import { getImportRuns, getPilotSettings, getRoster, getStaffList, requireStaff } from "@/lib/sor/queries";
import { isLiveBlackbaudConfigured } from "@/lib/sor/importers/blackbaud";
import { blackbaudConnection, isBlackbaudAppConfigured } from "@/lib/sor/blackbaud-auth";
import { isLiveCanvasPilotConfigured } from "@/lib/sor/importers/canvas";
import { isLiveFinalsiteApiConfigured } from "@/lib/sor/importers/finalsite-api";
import {
  AddParticipantForm,
  BlackbaudConnectPanel,
  GatePanel,
  ImportPanel,
  SamplePilotButton,
  StaffPanel,
} from "@/components/sor/PilotControls";
import { CONSENT_SCOPES, displayName } from "@/lib/sor/types";

const STAGE: Record<string, string> = {
  applicant: "Applicant",
  admitted: "Admitted",
  enrolled: "Enrolled",
  alumni: "Alumni",
  withdrawn: "Withdrawn",
};

const BLACKBAUD_NOTICE: Record<string, string> = {
  connected: "Blackbaud connected for the next hour.",
  "not-configured": "Blackbaud isn't set up: add BLACKBAUD_SUBSCRIPTION_KEY, BLACKBAUD_CLIENT_ID and BLACKBAUD_CLIENT_SECRET.",
  "admin-only": "Only an admin can connect Blackbaud.",
  declined: "Blackbaud sign-in was cancelled.",
  expired: "That Blackbaud sign-in expired. Try Connect again.",
  error: "Blackbaud didn't accept the sign-in. Check the client id/secret and that the redirect URI is registered on the SKY app.",
};

export default async function PilotPage({ searchParams }: { searchParams: Promise<{ blackbaud?: string }> }) {
  const { blackbaud: bbNotice } = await searchParams;
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const isAdmin = staff.role === "admin";
  const [settings, roster, runs, staffList] = await Promise.all([
    getPilotSettings(),
    getRoster(),
    getImportRuns(),
    isAdmin ? getStaffList() : Promise.resolve([]),
  ]);
  const bb = isAdmin ? await blackbaudConnection() : { token: null, expiresAt: null };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">Formation Pathways pilot</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          One Pathway per student, applicant to alumni. Finalsite, Blackbaud and Canvas only fill in
          people already on this list.
        </p>
      </div>

      <GatePanel settings={settings} isAdmin={isAdmin} />

      {staffList.some((m) => !m.active) && (
        <a href="#staff" className="block rounded-xl bg-[var(--color-pacific-light)] p-4 text-sm text-[var(--color-navy-ink)]">
          {staffList.filter((m) => !m.active).length} staff waiting for approval (Staff section below) →
        </a>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Pilot roster ({roster.length})</h2>
          {isAdmin && <SamplePilotButton />}
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          {roster.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-ink-muted)]">
              No one yet. Load the fictional sample pilot to try the whole pipeline.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {roster.map((p) => (
                <li key={p.id}>
                  <Link href={`/pilot/people/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-[var(--color-canvas)]">
                    <span className="font-medium text-[var(--color-navy-ink)]">
                      {displayName(p)}
                      {p.is_sample && (
                        <span className="ml-2 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                          Sample
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                      <span>{STAGE[p.stage]}{p.grad_year ? ` · '${String(p.grad_year).slice(2)}` : ""}</span>
                      <span>· {p.observation_count} obs.</span>
                      {!p.is_sample &&
                        CONSENT_SCOPES.map(({ scope, label }) => {
                          const has = p.consents.some((c) => c.scope === scope);
                          return (
                            <span
                              key={scope}
                              title={label}
                              className={`rounded-full px-2 py-0.5 ${has ? "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]" : "bg-[var(--color-canvas)] text-[var(--color-ink-muted)]"}`}
                            >
                              {has ? "✓" : "–"} {label}
                            </span>
                          );
                        })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {isAdmin && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-4">
            <p className="mb-2 text-sm font-medium text-[var(--color-navy-ink)]">Add a real pilot participant</p>
            <AddParticipantForm gateOpen={settings.real_data_enabled} />
          </div>
        )}
      </section>

      {isAdmin && (
        <section>
          <h2 id="import" className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">Import</h2>
          {bbNotice && BLACKBAUD_NOTICE[bbNotice] && (
            <p className="mb-3 rounded-xl bg-[var(--color-pacific-light)] p-3 text-sm text-[var(--color-navy-ink)]">
              {BLACKBAUD_NOTICE[bbNotice]}
            </p>
          )}
          <BlackbaudConnectPanel appConfigured={isBlackbaudAppConfigured()} expiresAt={bb.expiresAt} />
          <ImportPanel
            live={{ finalsite: isLiveFinalsiteApiConfigured(), blackbaud: isLiveBlackbaudConfigured(bb.token ?? process.env.BLACKBAUD_ACCESS_TOKEN ?? null), canvas: isLiveCanvasPilotConfigured() }}
          />
          {runs.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--color-ink-muted)]">
              {runs.map((r) => (
                <li key={r.id}>
                  {r.started_at.slice(0, 16).replace("T", " ")} · {r.system}
                  {r.kind === "funnel" ? " season counts" : ""} ({r.mode}) ·{" "}
                  {r.kind === "funnel" ? `${r.matched} counts` : `${r.matched} updated`}
                  {r.skipped_no_consent ? ` · ${r.skipped_no_consent} skipped, no consent` : ""}
                  {r.error ? ` · ${r.error.split("\n")[0]}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && (
        <section id="staff">
          <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
            Staff ({staffList.filter((m) => m.active).length})
          </h2>
          <StaffPanel staff={staffList} selfId={staff.user_id} autoApprove={settings.auto_approve_staff} />
        </section>
      )}
    </div>
  );
}
