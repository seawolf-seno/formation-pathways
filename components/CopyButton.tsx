"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
  absolutePath = false,
}: {
  text: string;
  label?: string;
  className?: string;
  /** Treat `text` as a site path and copy the full URL. */
  absolutePath?: boolean;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    const value = absolutePath ? `${window.location.origin}${text}` : text;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copy this", value);
    }
  }
  return (
    <button type="button" onClick={copy} className={className}>
      {done ? "Copied" : label}
    </button>
  );
}
