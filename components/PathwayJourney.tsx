"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { journeyFor, type JourneyMode } from "@/lib/pathway-journey";
import type { GeneratedPathway } from "@/lib/types";
import "./pathway-journey.css";

/** Keep in step with pathway-journey.css: node left (8px) + half its width
 *  (11px), and the gap between road cards. */
const TRAIL_X = 19;
const ROAD_GAP = 12;

/**
 * A pathway as a road rather than a wall of text: milestones appear one by
 * one along a trail that draws itself, the trail branches into the roads
 * beyond graduation, and a "glimpse" lets a family picture one ordinary day
 * inside it. Re-animates when its `key` changes (pass the selected pathway).
 * The steps are a real <ol>; the drawing is decoration (aria-hidden). Motion
 * is off for prefers-reduced-motion and in `still` mode (staff screens).
 */
export function PathwayJourney({
  pathway,
  mode = "applicant",
  still = false,
}: {
  pathway: GeneratedPathway;
  mode?: JourneyMode;
  still?: boolean;
}) {
  const { milestones, derived } = journeyFor(pathway, mode);
  const horizon = pathway.fourYearHorizon.filter(Boolean).slice(0, 3);
  const step = (i: number) => ({ "--i": i }) as CSSProperties;
  const afterSteps = milestones.length;

  // The road draws itself when it scrolls into view, not on page load (by
  // then a family is still reading the top of the page). Without
  // IntersectionObserver it simply plays.
  const root = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(still);
  useEffect(() => {
    const el = root.current;
    if (still || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  // The branches are drawn in real pixels so they leave exactly from the
  // trail and land on the middle of each road, whatever the column width.
  const roads = useRef<HTMLUListElement>(null);
  const [roadsWidth, setRoadsWidth] = useState(0);
  useEffect(() => {
    const el = roads.current;
    if (!el) return;
    const first = setTimeout(() => setRoadsWidth(Math.round(el.getBoundingClientRect().width)), 0);
    if (typeof ResizeObserver === "undefined") return () => clearTimeout(first);
    const ro = new ResizeObserver(([entry]) => setRoadsWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => {
      clearTimeout(first);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={root} className={`journey${still ? " journey--still" : ""}${inView ? " is-in-view" : ""}`}>
      <ol className="journey-steps" aria-label={`${pathway.name}, step by step`}>
        {milestones.map((m, i) => (
          <li key={i} className="journey-step" style={step(i)}>
            <span className="journey-node" aria-hidden="true" />
            {i < milestones.length - 1 || horizon.length > 0 ? (
              <svg className="journey-seg" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d={i % 2 === 0 ? "M10 0 C 22 30, -2 70, 10 100" : "M10 0 C -2 30, 22 70, 10 100"}
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
            <p className="journey-when">{m.when}</p>
            <h3 className="journey-title">{m.title}</h3>
            <p className="journey-detail">{m.detail}</p>
          </li>
        ))}
      </ol>

      {horizon.length > 0 && (
        <div className="journey-horizon" style={step(afterSteps)}>
          <p className="journey-when">Beyond these four years</p>
          <svg
            className="journey-branches"
            viewBox={`0 0 ${Math.max(1, roadsWidth)} 48`}
            aria-hidden="true"
          >
            {roadsWidth > 0 &&
              horizon.map((_, k) => {
                // From the trail's line (x = TRAIL_X) to the middle of road k.
                const col = (roadsWidth - ROAD_GAP * (horizon.length - 1)) / horizon.length;
                const x = k * (col + ROAD_GAP) + col / 2;
                return <path key={k} d={`M${TRAIL_X} 0 C ${TRAIL_X} 30, ${x} 18, ${x} 48`} pathLength={1} />;
              })}
          </svg>
          <ul ref={roads} className="journey-roads" style={{ "--n": horizon.length } as CSSProperties}>
            {horizon.map((road, k) => (
              <li key={k} className="journey-road" style={step(afterSteps + 1 + k * 0.4)}>
                {road}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pathway.glimpse && (
        <figure className="journey-glimpse" style={step(afterSteps + 2)}>
          <figcaption>A glimpse</figcaption>
          <blockquote>{pathway.glimpse}</blockquote>
        </figure>
      )}

      {!derived && (
        <div className="journey-companions" style={step(afterSteps + 2.5)}>
          <div>
            <p className="journey-when">People to learn alongside</p>
            <p className="journey-detail">{pathway.mentorArchetype}</p>
          </div>
          <div>
            <p className="journey-when">Room to stretch</p>
            <p className="journey-detail">{pathway.stretchChallenge}</p>
          </div>
        </div>
      )}
    </div>
  );
}
