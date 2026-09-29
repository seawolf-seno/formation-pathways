"use client";

import { useRef, useState } from "react";
import { FUNNEL_STAGES, STAGE_LABEL, type FunnelStage, type SeasonView } from "@/lib/sor/funnel";

// Emphasis: this season in navy, earlier seasons in grays that lighten with
// age. Identity never rides on color alone: legend, end label, tooltip and
// the table below the chart all name the season.
const CURRENT = "var(--color-navy)";
const PRIOR = ["#7d8b99", "#a3aeb9", "#c3cbd3"];

const W = 720, H = 280;
const M = { top: 16, right: 16, bottom: 28, left: 44 };
const IW = W - M.left - M.right, IH = H - M.top - M.bottom;
const MONTHS: [number, string][] = [
  [0, "Aug"], [61, "Oct"], [122, "Dec"], [184, "Feb"], [243, "Apr"], [304, "Jun"],
];

function niceMax(v: number) {
  if (v <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step + (Math.ceil(v / step) * step === v ? step : 0);
}

const fmt = (n: number | null) => (n == null ? "fewer than 5" : n.toLocaleString());

export function SeasonPace({ view }: { view: SeasonView }) {
  const [stage, setStage] = useState<FunnelStage>("application");
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const today = view.series.find((s) => s.isCurrent)!.points[stage].at(-1)?.day ?? 0;
  const max = niceMax(Math.max(0, ...view.series.flatMap((s) => s.points[stage].map((p) => p.count ?? 0))));
  const x = (day: number) => M.left + (day / 365) * IW;
  const y = (n: number) => M.top + IH - (n / max) * IH;
  const ticks = [0, max / 2, max];

  // Suppressed points (null) break the line rather than being drawn as 0.
  const paths = (pts: { day: number; count: number | null }[]) => {
    let d = "", pen = false;
    for (const p of pts) {
      if (p.count == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.count).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const valueAt = (pts: { day: number; count: number | null }[], day: number) => {
    let v: { day: number; count: number | null } | undefined;
    for (const p of pts) if (p.day <= day) v = p;
    return v;
  };
  // Oldest first so this season draws on top.
  const ordered = [...view.series].reverse();
  const colorOf = (i: number, isCurrent: boolean) => (isCurrent ? CURRENT : PRIOR[i] ?? PRIOR[PRIOR.length - 1]);
  const priorIndex = new Map(view.series.filter((s) => !s.isCurrent).map((s, i) => [s.entryYear, i]));
  const current = view.series.find((s) => s.isCurrent)!;
  const end = current.points[stage].at(-1);

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const day = Math.round((((e.clientX - r.left) / r.width) * W - M.left) / IW * 365);
    setHoverDay(day >= 0 && day <= 365 ? day : null);
  };
  const hoverDate = (day: number) => {
    const d = new Date(Date.UTC(2001, 7, 1) + day * 86_400_000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Pace through the season</h2>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Running total of {STAGE_LABEL[stage].toLowerCase()}, by date, each season since August 1.
          </p>
        </div>
        <div role="tablist" className="flex flex-wrap gap-1 rounded-lg bg-[var(--color-canvas)] p-1">
          {FUNNEL_STAGES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={stage === s}
              onClick={() => setStage(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${stage === s ? "bg-white text-[var(--color-navy-ink)] shadow-sm" : "text-[var(--color-ink-muted)]"}`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-ink-muted)]">
        {view.series.map((s) => (
          <li key={s.entryYear} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: colorOf(priorIndex.get(s.entryYear) ?? 0, s.isCurrent) }} />
            <span className={s.isCurrent ? "font-medium text-[var(--color-ink)]" : ""}>
              {s.label}{s.isCurrent ? " (this season)" : ""}
            </span>
          </li>
        ))}
      </ul>

      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`${STAGE_LABEL[stage]} running total by date for each season. The table below lists the same figures.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverDay(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--color-ink-muted)] text-[11px] tabular-nums">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {MONTHS.map(([d, label]) => (
            <text key={label} x={x(d)} y={H - 8} textAnchor="middle" className="fill-[var(--color-ink-muted)] text-[11px]">
              {label}
            </text>
          ))}
          <line x1={x(today)} x2={x(today)} y1={M.top} y2={M.top + IH} stroke="var(--color-gold)" strokeWidth={1} />
          <text x={x(today) + 4} y={M.top + 10} className="fill-[var(--color-ink-muted)] text-[11px]">Today</text>

          {ordered.map((s) => (
            <path
              key={s.entryYear}
              d={paths(s.points[stage])}
              fill="none"
              stroke={colorOf(priorIndex.get(s.entryYear) ?? 0, s.isCurrent)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {end?.count != null && (
            <>
              <circle cx={x(end.day)} cy={y(end.count)} r={5} fill={CURRENT} stroke="white" strokeWidth={2} />
              <text x={x(end.day) + 9} y={y(end.count)} dy="0.32em" className="fill-[var(--color-ink)] text-[12px] font-semibold">
                {end.count.toLocaleString()}
              </text>
            </>
          )}

          {hoverDay != null && (
            <g pointerEvents="none">
              <line x1={x(hoverDay)} x2={x(hoverDay)} y1={M.top} y2={M.top + IH} stroke="var(--color-ink-muted)" strokeWidth={1} />
              {ordered.map((s) => {
                const v = valueAt(s.points[stage], hoverDay);
                return v?.count != null && v.day >= hoverDay - 7 ? (
                  <circle key={s.entryYear} cx={x(hoverDay)} cy={y(v.count)} r={4}
                    fill={colorOf(priorIndex.get(s.entryYear) ?? 0, s.isCurrent)} stroke="white" strokeWidth={2} />
                ) : null;
              })}
            </g>
          )}
        </svg>

        {hoverDay != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: `${Math.min(70, (x(hoverDay) / W) * 100)}%`, transform: "translateX(8px)" }}
          >
            <p className="mb-1 font-medium text-[var(--color-navy-ink)]">{STAGE_LABEL[stage]} by {hoverDate(hoverDay)}</p>
            {view.series.map((s) => {
              const v = valueAt(s.points[stage], hoverDay);
              const shown = v && v.day >= hoverDay - 7;
              return (
                <p key={s.entryYear} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorOf(priorIndex.get(s.entryYear) ?? 0, s.isCurrent) }} />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-[var(--color-ink)]">{shown ? fmt(v!.count) : "—"}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
