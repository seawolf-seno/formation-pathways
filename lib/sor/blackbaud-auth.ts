import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";

/**
 * "Connect Blackbaud": SKY API's OAuth authorization code flow with PKCE, run
 * by an admin from /pilot. The access token (60 min) lives only in that
 * admin's browser, in an httpOnly cookie. It isn't stored in the database or
 * logged, and it's never refreshed: connect again before each import.
 * Endpoints and parameters follow Blackbaud's own sample
 * (github.com/blackbaud/sky-api-tutorial-auth-code-nodejs).
 *
 * Env: BLACKBAUD_SUBSCRIPTION_KEY, BLACKBAUD_CLIENT_ID (the SKY app's
 * Application ID) and BLACKBAUD_CLIENT_SECRET. The SKY app must list
 * <origin>/auth/blackbaud/callback as a redirect URI, and a Blackbaud
 * environment admin must connect the app to the school's environment.
 */
export const SKY_AUTHORIZE = "https://oauth2.sky.blackbaud.com/authorization";
export const SKY_TOKEN = "https://oauth2.sky.blackbaud.com/token";
export const TOKEN_COOKIE = "bb_sky_token";
export const FLOW_COOKIE = "bb_sky_flow";
export const CALLBACK_PATH = "/auth/blackbaud/callback";

const env = (k: string) => process.env[k]?.trim() || undefined;

export function isBlackbaudAppConfigured(): boolean {
  return Boolean(env("BLACKBAUD_SUBSCRIPTION_KEY") && env("BLACKBAUD_CLIENT_ID") && env("BLACKBAUD_CLIENT_SECRET"));
}

const b64url = (b: Buffer) => b.toString("base64url");

/** state + PKCE verifier/challenge for one sign-in. */
export function newFlow() {
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge };
}

export function authorizeUrl(origin: string, state: string, challenge: string): string {
  const u = new URL(SKY_AUTHORIZE);
  u.searchParams.set("client_id", env("BLACKBAUD_CLIENT_ID")!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", `${origin}${CALLBACK_PATH}`);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** Code → access token. Credentials go in a Basic header, as in Blackbaud's sample. */
export async function exchangeCode(origin: string, code: string, verifier: string): Promise<{ token: string; expiresIn: number }> {
  const basic = Buffer.from(`${env("BLACKBAUD_CLIENT_ID")}:${env("BLACKBAUD_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(SKY_TOKEN, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}${CALLBACK_PATH}`,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const why = [json.error, json.error_description].filter((v) => typeof v === "string").join(": ").slice(0, 200);
    throw new Error(`Blackbaud sign-in failed (${res.status})${why ? `: ${why}` : ""}`);
  }
  return { token: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

/** This admin's live token, if they've connected in the last hour. */
export async function blackbaudConnection(): Promise<{ token: string | null; expiresAt: string | null }> {
  const raw = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!raw) return { token: null, expiresAt: null };
  const dot = raw.indexOf(".");
  const exp = Number(raw.slice(0, dot));
  if (!exp || exp <= Date.now()) return { token: null, expiresAt: null };
  return { token: raw.slice(dot + 1), expiresAt: new Date(exp).toISOString() };
}

/** Cookie value: "<expires ms>.<token>". */
export const tokenCookieValue = (token: string, expiresIn: number) =>
  `${Date.now() + Math.max(60, expiresIn - 60) * 1000}.${token}`;
