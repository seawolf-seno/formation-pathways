import { ImageResponse } from "next/og";
import { CARD_SIZES, type CardFormat, type PublicShareContent } from "./share";

// Brand values mirror app/globals.css (satori can't read CSS variables).
const NAVY = "#16324f";
const NAVY_INK = "#0f2338";
const PACIFIC = "#8fb3d9";
const GOLD = "#c9a24b";
const CREAM = "#f6ecd9";

/** Where "Discover Pacifica" points. Override per deployment. */
export function admissionsUrl(): string {
  return process.env.NEXT_PUBLIC_ADMISSIONS_URL ?? "https://www.pacificachristian.org/admissions";
}

function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export function renderShareCard(
  content: PublicShareContent,
  format: CardFormat
): ImageResponse {
  const { width, height } = CARD_SIZES[format];
  const wide = format === "og";
  const tall = format === "story";
  const pad = wide ? 56 : 84;
  const nameSize = wide ? 62 : tall ? 116 : 104;
  const bodySize = wide ? 26 : tall ? 46 : 38;
  const chipSize = wide ? 20 : tall ? 32 : 28;
  const horizon = wide ? (content.horizon ?? []).slice(0, 2) : (content.horizon ?? []);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_INK} 100%)`,
          color: "white",
          // Stories: keep text clear of Instagram's own top and bottom UI.
          padding: tall ? `220px ${pad}px` : pad,
          borderTop: `14px solid ${GOLD}`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: tall ? "center" : "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: wide ? 20 : 26,
              letterSpacing: 6,
              color: GOLD,
              textTransform: "uppercase",
            }}
          >
            Pacifica Christian High School
          </div>
          <div
            style={{
              display: "flex",
              marginTop: wide ? 24 : 56,
              fontSize: wide ? 26 : 36,
              color: PACIFIC,
            }}
          >
            {content.firstName}&apos;s Pathway
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: nameSize,
              fontWeight: 700,
              lineHeight: 1.05,
            }}
          >
            {content.pathwayName}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: wide ? 24 : 48,
              paddingLeft: 28,
              borderLeft: `6px solid ${GOLD}`,
              fontSize: bodySize,
              lineHeight: 1.4,
              color: CREAM,
            }}
          >
            {content.highlight}
          </div>
          {content.stretchChallenge && !wide ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 40,
                fontSize: bodySize - 6,
                lineHeight: 1.4,
                color: "white",
              }}
            >
              <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: PACIFIC, textTransform: "uppercase" }}>
                A stretch challenge
              </div>
              <div style={{ display: "flex", marginTop: 8 }}>{content.stretchChallenge}</div>
            </div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: wide ? 20 : 40 }}>
            {[...(content.program ? [`With Pacifica ${content.program}`] : []), ...horizon].map(
              (chip, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    marginRight: 14,
                    marginBottom: 14,
                    padding: wide ? "8px 16px" : "12px 24px",
                    borderRadius: 999,
                    border: `2px solid ${PACIFIC}`,
                    fontSize: chipSize,
                    color: "white",
                  }}
                >
                  {chip}
                </div>
              )
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: wide ? 22 : 30,
              fontStyle: "italic",
              color: CREAM,
            }}
          >
            An invitation, not a prediction.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: wide ? 20 : 28,
              color: GOLD,
            }}
          >
            Discover your child&apos;s Pathway · {displayHost(admissionsUrl())}
          </div>
        </div>
      </div>
    ),
    { width, height }
  );
}
