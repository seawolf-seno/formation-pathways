// Where to send someone after they sign in. Only a path on this site: the
// value comes from a URL (?next=), so it's attacker-controlled. Browsers treat
// "/\evil.example" and "/<tab>/evil.example" as other sites even though they
// start with "/", so resolve it and keep it only if it stays on our origin.
// Pure; tested in tests/safe-next.test.mjs.

const FALLBACK = "/capture";
const PROBE = "https://same-origin.invalid";

export function safeNext(next: unknown, fallback = FALLBACK): string {
  const n = typeof next === "string" ? next : "";
  // No backslashes or control/whitespace characters anywhere; must be a path.
  if (!n.startsWith("/") || /[\\\s\u0000-\u001f\u007f]/.test(n)) return fallback;
  try {
    const u = new URL(n, PROBE);
    if (u.origin !== PROBE) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
