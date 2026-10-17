import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import type { Catalog, OhPathway } from "./openhouse";

// The Open House card (Fizzy #38): one image a family can post, text or save.
// Portrait 1080×1350 (Instagram/Facebook post, texts) and a 1200×630 link
// preview. Brand fonts and colors as the family share cards.

const font = (file: string) => readFileSync(join(process.cwd(), "assets/fonts", file));
let fonts: { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" }[] | null = null;
const loadFonts = () =>
  (fonts ??= [
    { name: "Lora", data: font("Lora-500-latin.woff"), weight: 500, style: "normal" },
    { name: "Inter", data: font("Inter-400-latin.woff"), weight: 400, style: "normal" },
    { name: "Inter", data: font("Inter-600-latin.woff"), weight: 600, style: "normal" },
  ]);
let logo: string | null = null;
const logoSrc = () => (logo ??= `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/brand/pacifica-logo-white.svg")).toString("base64")}`);

const NAVY = "#16324f";
const GOLD = "#c9a24b";
const PACIFIC = "#8fb3d9";

export interface CardData {
  firstName: string;
  pathways: OhPathway[];
  usedAi: boolean;
  reviewedBy: string | null;
  url: string; // what the QR code opens (the family's invite link)
}

const possessive = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);

export async function openHouseCard(data: CardData, catalog: Catalog, format: "post" | "og", opts: { download?: boolean } = {}) {
  const mentors = [...new Set(data.pathways.flatMap((p) => p.mentors))].map((id) => catalog.mentors.find((m) => m.id === id)).filter(Boolean).slice(0, 3);
  const projects = [...new Set(data.pathways.flatMap((p) => p.projects))].map((id) => catalog.projects.find((p) => p.id === id)).filter(Boolean).slice(0, 4);
  const qr = `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(data.url, { type: "svg", margin: 1, color: { dark: NAVY, light: "#ffffff" } })).toString("base64")}`;
  const post = format === "post";
  const [w, h] = post ? [1080, 1350] : [1200, 630];
  const footer = data.reviewedBy ? `Drafted with AI · Reviewed by ${data.reviewedBy}` : "Drafted with AI from what we shared";

  const body = post ? (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: NAVY, color: "white", padding: 72, fontFamily: "Inter" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc()} alt="" width={260} height={55} />
        <div style={{ display: "flex", color: GOLD, fontSize: 26, fontWeight: 600, letterSpacing: 4 }}>FORMATION PATHWAY</div>
      </div>
      <div style={{ display: "flex", fontFamily: "Lora", fontSize: 76, lineHeight: 1.05, marginTop: 64 }}>{`${possessive(data.firstName)} ${data.pathways[0]?.title ?? "Pathway"}`}</div>
      {data.pathways[1] && <div style={{ display: "flex", fontFamily: "Lora", fontSize: 44, color: PACIFIC, marginTop: 18 }}>{`and ${data.pathways[1].title}`}</div>}
      <div style={{ display: "flex", gap: 48, marginTop: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", color: GOLD, fontSize: 24, fontWeight: 600, letterSpacing: 3 }}>MENTORS</div>
          {mentors.map((m) => (
            <div key={m!.id} style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 600 }}>{m!.name}</div>
              <div style={{ display: "flex", fontSize: 26, color: PACIFIC }}>{m!.department}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1.2 }}>
          <div style={{ display: "flex", color: GOLD, fontSize: 24, fontWeight: 600, letterSpacing: 3 }}>PROJECTS</div>
          {projects.map((p) => (
            <div key={p!.id} style={{ display: "flex", fontSize: 32, marginTop: 18, lineHeight: 1.2 }}>{p!.title}</div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 40, background: "white", color: NAVY, borderRadius: 28, padding: 36 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="" width={210} height={210} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontFamily: "Lora", fontSize: 38, lineHeight: 1.2 }}>{catalog.keyText}</div>
          <div style={{ display: "flex", fontSize: 26, marginTop: 14, fontWeight: 600, color: GOLD }}>Scan to get yours</div>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 20, color: PACIFIC, marginTop: 24 }}>{footer}</div>
    </div>
  ) : (
    <div style={{ display: "flex", width: "100%", height: "100%", background: NAVY, color: "white", padding: 56, fontFamily: "Inter", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", color: GOLD, fontSize: 22, fontWeight: 600, letterSpacing: 4 }}>FORMATION PATHWAY</div>
        <div style={{ display: "flex", fontFamily: "Lora", fontSize: 58, lineHeight: 1.08, marginTop: 24 }}>{`${possessive(data.firstName)} ${data.pathways[0]?.title ?? "Pathway"}`}</div>
        <div style={{ display: "flex", fontSize: 26, color: PACIFIC, marginTop: 20 }}>{mentors.map((m) => m!.name).join(" · ")}</div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontFamily: "Lora", fontSize: 30, lineHeight: 1.25 }}>{catalog.keyText}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "white", borderRadius: 24, padding: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="" width={230} height={230} />
        <div style={{ display: "flex", color: NAVY, fontSize: 22, fontWeight: 600, marginTop: 10 }}>Scan to get yours</div>
      </div>
    </div>
  );

  return new ImageResponse(body, {
    width: w,
    height: h,
    fonts: loadFonts(),
    headers: {
      "Cache-Control": "no-store",
      ...(opts.download ? { "Content-Disposition": `attachment; filename="${data.firstName.replace(/[^A-Za-z0-9]/g, "") || "my"}-pathway.png"` } : {}),
    },
  });
}

/** A QR code as an inline SVG string (for signs on the live wall). */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, color: { dark: NAVY, light: "#ffffff" } });
}
