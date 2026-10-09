"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CARD_STYLES, PALETTES, SHARE_DISCLOSURE, defaultCaption, shareTargets, withDisclosure, type CardStyle } from "@/lib/family-share";
import "./share-studio.css";

export type ShareAction = (index: number, style: CardStyle, guardian: boolean) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
type Size = "feed" | "story";

const noop = () => () => {};
let shareImages: boolean | undefined;
/** Can this browser share an image file (phones, mostly)? Asked once. */
function canShareImages(): boolean {
  if (shareImages === undefined) {
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      shareImages = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    } catch {
      shareImages = false;
    }
  }
  return shareImages;
}

/**
 * Pick a pathway, a look and a size, then one Share button. On a phone that
 * opens the phone's own share sheet with the image and link attached
 * (Instagram, Messages, WhatsApp…); everywhere, the link, the networks, a
 * saved image and the caption are one tap away. Nothing is public until the
 * person on the page confirms they're the child's parent or guardian; after
 * that the public link is made as soon as a choice is made, so the Share tap
 * itself is instant. While Pacifica thanks families for referrals, the
 * shared words always end with the disclosure (withDisclosure).
 */
export function ShareStudio({
  childFirstName, pathwayNames, selected, onSelect, cardBase, share, stopSharing, thanks = false,
}: {
  childFirstName: string;
  pathwayNames: string[];
  selected: number;
  onSelect: (i: number) => void;
  cardBase: string;
  share?: ShareAction;
  stopSharing?: () => Promise<{ ok: boolean }>;
  /** Thank-yous are on: the shared words carry the disclosure. */
  thanks?: boolean;
}) {
  const [guardian, setGuardian] = useState(false);
  const [style, setStyle] = useState<CardStyle>("tide");
  const [size, setSize] = useState<Size>("feed");
  const [link, setLink] = useState<{ key: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "caption" | null>(null);
  const [stopped, setStopped] = useState(false);
  const canShareFiles = useSyncExternalStore(noop, canShareImages, () => false);
  const blob = useRef<{ key: string; file: File } | null>(null);

  const key = `${selected}:${style}`;
  const image = (format: string, extra = "") => `${cardBase}?p=${selected}&style=${style}&format=${format}${extra}`;
  const url = link?.key === key ? link.url : null;
  const pathwayName = pathwayNames[selected] ?? "";
  const text = caption ?? (url ? defaultCaption(childFirstName, pathwayName, url, thanks) : "");
  const shared = withDisclosure(text, thanks);

  // Make (or find) the public link for this choice, and fetch the image, so
  // the Share tap can open the share sheet straight away.
  useEffect(() => {
    if (!share || stopped || !guardian) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await share(selected, style, true).catch(() => ({ ok: false as const, error: "We couldn't make your link just now. Try again in a minute." }));
      if (!live) return;
      if (res.ok) {
        setLink({ key, url: res.url });
        setError(null);
        setCaption(null);
      } else setError(res.error);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [share, selected, style, key, stopped, guardian]);

  useEffect(() => {
    if (!canShareFiles) return;
    const k = `${key}:${size}`;
    let live = true;
    fetch(image(size))
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (live) blob.current = { key: k, file: new File([b], `${childFirstName}-pathway-${size}.png`, { type: "image/png" }) };
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShareFiles, key, size]);

  const copy = async (what: "link" | "caption", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const shareNow = async () => {
    if (!url) return;
    const file = blob.current?.key === `${key}:${size}` ? blob.current.file : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shared });
      } else if (typeof navigator.share === "function") {
        await navigator.share({ text: shared, url });
      } else {
        await copy("link", url);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") await copy("link", url);
    }
  };

  return (
    <section className="family-choices fw-section ss" id="share">
      <div className="family-section-heading">
        <div>
          <p className="family-eyebrow">If you&apos;d like to share it</p>
          <h2>Share {childFirstName}&apos;s pathway</h2>
        </div>
        <p>First name only. You choose what to post, and you can stop sharing any time.</p>
      </div>

      <div className="ss-grid">
        <div className="ss-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${key}:${size}`}
            className={`ss-card ss-${size}`}
            src={image(size)}
            alt={`${childFirstName}'s card: ${pathwayName}`}
          />
        </div>

        <div className="ss-controls">
          {pathwayNames.length > 1 && (
            <fieldset className="ss-field">
              <legend>Pathway</legend>
              <div className="ss-options">
                {pathwayNames.map((name, i) => (
                  <button key={i} type="button" className="ss-option" aria-pressed={selected === i} onClick={() => onSelect(i)}>
                    {name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="ss-field">
            <legend>Look</legend>
            <div className="ss-looks">
              {CARD_STYLES.map((s) => (
                <button key={s} type="button" className="ss-look" aria-pressed={style === s} onClick={() => setStyle(s)}>
                  <span className="ss-swatch" style={{ background: `linear-gradient(180deg, ${PALETTES[s].bg} 0 62%, ${PALETTES[s].waveFront} 62%)` }}>
                    <span style={{ background: PALETTES[s].accent }} />
                  </span>
                  {PALETTES[s].label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="ss-field">
            <legend>Size</legend>
            <div className="ss-options">
              <button type="button" className="ss-option" aria-pressed={size === "feed"} onClick={() => setSize("feed")}>Post</button>
              <button type="button" className="ss-option" aria-pressed={size === "story"} onClick={() => setSize("story")}>Story</button>
            </div>
          </fieldset>

          {!share ? (
            <p className="ss-note">Staff preview: families share from their own link.</p>
          ) : !guardian ? (
            <label className="ss-guardian">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
              <span>
                I&apos;m {childFirstName}&apos;s parent or guardian, and I choose to share this pathway with {childFirstName}&apos;s first
                name. I can stop sharing at any time.
              </span>
            </label>
          ) : stopped ? (
            <p className="ss-note">You&apos;ve stopped sharing. Links you posted no longer open {childFirstName}&apos;s pathway.</p>
          ) : (
            <>
              <button type="button" className="ss-primary" disabled={!url} onClick={shareNow}>
                {!url ? "Getting your link…" : canShareFiles ? "Share" : "Copy your link"}
              </button>
              {error && <p className="ss-error">{error}</p>}

              {url && (
                <div className="ss-more">
                  <div className="ss-targets">
                    {shareTargets(url, shared, childFirstName).map((t) => (
                      <a key={t.id} className="ss-target" href={t.href} target="_blank" rel="noopener noreferrer">{t.label}</a>
                    ))}
                    <a className="ss-target" href={image(size, "&download=1")} download>Save image</a>
                  </div>
                  <p className="ss-tip">
                    Instagram: save the {size === "story" ? "story" : "post"} image, post it, and add your link as a link sticker
                    (stories) or in your bio.
                  </p>

                  <label className="ss-label" htmlFor="ss-caption">Your words</label>
                  <textarea id="ss-caption" className="ss-caption" rows={4} value={text} onChange={(e) => setCaption(e.target.value)} />
                  <div className="ss-row">
                    <button type="button" className="ss-secondary" onClick={() => copy("caption", shared)}>
                      {copied === "caption" ? "Copied" : "Copy words"}
                    </button>
                    <button type="button" className="ss-secondary" onClick={() => copy("link", url)}>
                      {copied === "link" ? "Copied" : "Copy link"}
                    </button>
                  </div>
                  <p className="ss-fine">
                    {thanks && <><span className="ss-disclosure">We always add this line: {SHARE_DISCLOSURE}</span>{" "}</>}
                    Your link opens a page with {childFirstName}&apos;s first name and this pathway. Families who inquire through it
                    are connected to yours{thanks ? ", so we can thank you" : ""}.{" "}
                    {stopSharing && (
                      <button
                        type="button"
                        className="ss-stop"
                        onClick={async () => {
                          const res = await stopSharing().catch(() => ({ ok: false }));
                          if (res.ok) {
                            setStopped(true);
                            setLink(null);
                          }
                        }}
                      >
                        Stop sharing
                      </button>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
