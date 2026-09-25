import { ImageResponse } from "next/og";
import { CARD_SIZES, type CardFormat, type PublicShareContent } from "./share";

/** Existing configurable admissions destination; confirm with school before launch. */
export function admissionsUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ADMISSIONS_URL ??
    "https://www.pacificachristian.org/admissions"
  );
}

function excerpt(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

// Image is deliberately a headline card; all selected details remain on the public page.
// Bounded copy prevents long approved narratives from overflowing fixed social dimensions.
export function renderShareCard(
  content: PublicShareContent,
  format: CardFormat,
): ImageResponse {
  const { width, height } = CARD_SIZES[format];
  const wide = format === "og";
  const story = format === "story";
  const title = excerpt(content.pathwayName, 95);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#f8f5ed",
          color: "#16324f",
          padding: story ? "240px 80px" : wide ? "46px 60px" : "70px 80px",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderBottom: "1px solid #16324f40",
            paddingBottom: 25,
            fontFamily: "sans-serif",
            fontSize: wide ? 18 : 23,
            letterSpacing: 3,
          }}
        >
          <span>PACIFICA CHRISTIAN</span>
          <span style={{ color: "#81622e" }}>POSSIBILITIES</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "sans-serif",
              fontSize: wide ? 22 : 30,
              color: "#526474",
            }}
          >
            Imagine what’s possible for {excerpt(content.firstName, 32)}.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: wide
                ? title.length > 45
                  ? 44
                  : 64
                : title.length > 45
                  ? 66
                  : 92,
              lineHeight: 1.13,
              marginTop: 22,
              marginBottom: wide ? 22 : 40,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "sans-serif",
              fontSize: wide ? 24 : 34,
              lineHeight: 1.55,
              color: "#526474",
            }}
          >
            {excerpt(content.highlight, wide ? 170 : 260)}
          </div>
          {content.program && (
            <div
              style={{
                display: "flex",
                fontFamily: "sans-serif",
                fontSize: wide ? 18 : 25,
                color: "#81622e",
                marginTop: 26,
              }}
            >
              With Pacifica {excerpt(content.program, 50)}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid #16324f40",
            paddingTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: wide ? 22 : 32,
              fontStyle: "italic",
            }}
          >
            An invitation, not a prediction.
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "sans-serif",
              fontSize: wide ? 14 : 19,
              marginTop: 16,
              color: "#526474",
            }}
          >
            Discover Pacifica · Fictional applicant / demonstration
          </div>
        </div>
      </div>
    ),
    { width, height },
  );
}
