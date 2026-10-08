import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CARD_SIZES, type CardFormat } from "./share";
import { PALETTES, type CardContent, type CardStyle } from "./family-share";
import { seawolfSvg, wavesSvg } from "./seawolf-svg";

// Share cards for an inquiring family's pathway (docs/family-sharing.md):
// post (1080×1350), story (1080×1920, text clear of the top and bottom 250px
// that Instagram covers) and link preview (1200×630). Lora + Inter from
// assets/fonts, brand colors, the seawolf pup on the waves.

const font = (file: string) => readFileSync(join(process.cwd(), "assets/fonts", file));
let fonts: { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" | "italic" }[] | null = null;
function loadFonts() {
  fonts ??= [
    { name: "Lora", data: font("Lora-500-latin.woff"), weight: 500, style: "normal" },
    { name: "Lora", data: font("Lora-500-latin-ext.woff"), weight: 500, style: "normal" },
    { name: "Lora", data: font("Lora-500-italic-latin.woff"), weight: 500, style: "italic" },
    { name: "Lora", data: font("Lora-500-italic-latin-ext.woff"), weight: 500, style: "italic" },
    { name: "Inter", data: font("Inter-400-latin.woff"), weight: 400, style: "normal" },
    { name: "Inter", data: font("Inter-400-latin-ext.woff"), weight: 400, style: "normal" },
    { name: "Inter", data: font("Inter-600-latin.woff"), weight: 600, style: "normal" },
    { name: "Inter", data: font("Inter-600-latin-ext.woff"), weight: 600, style: "normal" },
  ];
  return fonts;
}

// The official logo is white and must not be recolored: on the light looks it
// sits on a navy badge.
let logoSrc: string | null = null;
const LOGO_RATIO = 4.748;
function Logo({ height, badge }: { height: number; badge: boolean }) {
  logoSrc ??= `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/brand/pacifica-logo-white.svg")).toString("base64")}`;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoSrc} alt="" width={Math.round(height * LOGO_RATIO)} height={height} />
  );
  if (!badge) return <div style={{ display: "flex" }}>{img}</div>;
  const pad = Math.round(height * 0.32);
  return (
    <div style={{ display: "flex", background: "#16324f", borderRadius: Math.round(height * 0.22), padding: `${pad}px ${Math.round(pad * 1.5)}px` }}>
      {img}
    </div>
  );
}

/** Big for a short name, smaller as it grows, so any name fits in three lines. */
function nameSize(name: string, big: number) {
  if (name.length <= 20) return big;
  if (name.length <= 34) return Math.round(big * 0.84);
  return Math.round(big * 0.68);
}

export function renderFamilyCard(content: CardContent, style: CardStyle, format: CardFormat): ImageResponse {
  const { width, height } = CARD_SIZES[format];
  const c = PALETTES[style];
  const badge = c.logo === "navy";
  const pup = seawolfSvg({
    // A silver pup on the night sky, a navy one on the light looks.
    body: style === "tide" ? "#c9d6e6" : "#16324f",
    light: style === "tide" ? "#ffffff" : "#e8eef5",
    board: "#c9a24b",
    eye: "#c9a24b",
    nose: "#0b1a2a",
    water: c.waveFront,
  });
  const background = `linear-gradient(180deg, ${c.bg} 0%, ${c.bg2} 100%)`;
  const eyebrow = `A WAY ${content.firstName.toUpperCase()} COULD GROW`;
  // Text on the front wave: dark on the light blue waves, cream on navy.
  const footInk = style === "paper" ? "#f8f5ed" : "#0f2338";

  if (format === "og") {
    const waveH = 170;
    const waves = wavesSvg(width, waveH, c.waveBack, c.waveFront, c.crest);
    const line = content.line.length > 110 ? `${content.line.slice(0, 108).replace(/\s+\S*$/, "")}…` : content.line;
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background, color: c.ink, fontFamily: "Inter", position: "relative", padding: "44px 64px 0" }}>
          <Logo height={badge ? 34 : 42} badge={badge} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34, width: 760 }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: 4, color: c.accent }}>{eyebrow}</div>
            <div style={{ fontFamily: "Lora", fontSize: nameSize(content.pathwayName, 58), lineHeight: 1.08, marginTop: 14 }}>
              {content.pathwayName}
            </div>
            {line && (
              <div style={{ fontFamily: "Lora", fontStyle: "italic", fontSize: 23, lineHeight: 1.45, color: c.muted, marginTop: 16 }}>{line}</div>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={waves} alt="" width={width} height={waveH} style={{ position: "absolute", left: 0, bottom: 0 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pup} alt="" width={300} height={200} style={{ position: "absolute", right: 70, bottom: Math.round(waveH * 0.55 - 200 * 0.31) }} />
          <div style={{ position: "absolute", left: 64, bottom: 26, fontSize: 18, fontWeight: 600, color: footInk }}>
            Pacifica Christian High School · An invitation, not a prediction.
          </div>
        </div>
      ),
      { width, height, fonts: loadFonts() },
    );
  }

  const story = format === "story";
  const pad = 84;
  const top = story ? 250 : 76;
  // The footer sits in the front wave, below its crest; on a story, also
  // above the bottom 250px Instagram covers.
  const waveH = story ? 420 : 330;
  const waves = wavesSvg(width, waveH, c.waveBack, c.waveFront, c.crest);
  const pupW = story ? 440 : 360;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background, color: c.ink, fontFamily: "Inter", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${top}px ${pad}px 0` }}>
          <Logo height={badge ? 46 : 58} badge={badge} />
          {/* On a story the footer can't sit in the water: Instagram covers the bottom. */}
          {story && <div style={{ fontSize: 24, color: c.muted }}>An invitation, not a prediction.</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: `${story ? 110 : 96}px ${pad}px 0` }}>
          <div style={{ fontSize: story ? 30 : 26, fontWeight: 600, letterSpacing: 6, color: c.accent }}>{eyebrow}</div>
          <div style={{ fontFamily: "Lora", fontSize: nameSize(content.pathwayName, story ? 118 : 104), lineHeight: 1.04, marginTop: 26, letterSpacing: -1 }}>
            {content.pathwayName}
          </div>
          <div style={{ width: 120, height: 5, background: c.accent, marginTop: story ? 56 : 44 }} />
          {content.line && (
            <div style={{ fontFamily: "Lora", fontStyle: "italic", fontSize: story ? 40 : 38, lineHeight: 1.42, color: c.ink, opacity: 0.92, marginTop: story ? 52 : 40, maxWidth: 880 }}>
              {content.line}
            </div>
          )}
          {content.program && (
            <div style={{ fontSize: story ? 28 : 24, color: c.muted, marginTop: story ? 40 : 32 }}>{`Starts in ${content.program} at Pacifica`}</div>
          )}
          {story && content.horizon.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 5, color: c.muted }}>WHERE IT COULD LEAD</div>
              {content.horizon.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", fontSize: 32, color: c.ink, marginTop: 20 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: c.accent, marginRight: 22 }} />
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={waves} alt="" width={width} height={waveH} style={{ position: "absolute", left: 0, bottom: 0 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pup} alt="" width={pupW} height={Math.round(pupW * (80 / 120))} style={{ position: "absolute", right: 60, bottom: Math.round(waveH * 0.55 - pupW * (80 / 120) * 0.31) }} />
        {!story && (
          <div style={{ position: "absolute", left: pad, bottom: 54, display: "flex", flexDirection: "column", fontSize: 24, color: footInk }}>
            <div style={{ fontWeight: 600 }}>Pacifica Christian High School</div>
            <div style={{ marginTop: 6, opacity: 0.85 }}>An invitation, not a prediction.</div>
          </div>
        )}
      </div>
    ),
    { width, height, fonts: loadFonts() },
  );
}

/** A card as an HTTP response: `download` saves it with a friendly name. */
export function familyCardResponse(content: CardContent, style: CardStyle, format: CardFormat, opts: { download?: boolean; cache: "private" | "public" }) {
  const res = renderFamilyCard(content, style, format);
  res.headers.set("Cache-Control", opts.cache === "public" ? "public, max-age=300" : "private, no-store");
  if (opts.download) {
    const name = `${content.firstName}-pathway-${format === "story" ? "story" : format === "og" ? "link" : "post"}.png`.replace(/[^\w.-]+/g, "-");
    res.headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  return res;
}
