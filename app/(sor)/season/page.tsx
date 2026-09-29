import { redirect } from "next/navigation";
import { getFunnelCounts, getPilotSettings, logAccess, requireStaff } from "@/lib/sor/queries";
import { buildSeasonView, seasonLabel, seasonOf } from "@/lib/sor/funnel";
import { isLiveFinalsiteApiConfigured } from "@/lib/sor/importers/finalsite-api";
import { SeasonDashboard } from "@/components/sor/SeasonDashboard";
import { SeasonApprovalPanel, SeasonSourcePanel } from "@/components/sor/SeasonControls";

export default async function SeasonPage() {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const isAdmin = staff.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const [{ rows, mode, importedAt }, settings] = await Promise.all([getFunnelCounts(), getPilotSettings()]);
  await logAccess(staff, "view_season", null, { mode });
  const view = rows.length ? buildSeasonView(rows, today) : null;
  const current = seasonOf(today);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">Admissions season</p>
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            {seasonLabel(current)} · entering fall {current}
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Whole-school totals from Finalsite, compared with past seasons on the same date. Counts only: no names, no
            individual families.
          </p>
        </div>
        {mode !== "none" && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              mode === "live" ? "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]" : "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]"
            }`}
          >
            {mode === "live" ? "Live from Finalsite" : "Sample figures (fictional)"}
            {importedAt ? ` · updated ${importedAt.slice(0, 10)}` : ""}
          </span>
        )}
      </div>

      <SeasonDashboard view={view} today={today} isAdmin={isAdmin} />

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Data source</h2>
          <SeasonApprovalPanel settings={settings} />
          <SeasonSourcePanel settings={settings} apiConfigured={isLiveFinalsiteApiConfigured()} />
        </section>
      )}
    </div>
  );
}
