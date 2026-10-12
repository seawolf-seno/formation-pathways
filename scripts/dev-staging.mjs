// `npm run dev:staging`: the app on your computer against the STAGING
// database (fictional students only). Loads .env.staging.example over
// anything else (so a production URL in .env.local can't win), then starts
// `next dev` with any extra arguments, e.g. `npm run dev:staging -- -p 3001`.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const staging = parseEnv(readFileSync(new URL("../.env.staging.example", import.meta.url), "utf8"));
if (!staging.NEXT_PUBLIC_SUPABASE_URL?.includes("tavgqwdqlwpmcejzefso")) {
  console.error("dev:staging: .env.staging.example doesn't point at the staging project. Not starting.");
  process.exit(1);
}
const env = { ...process.env, ...staging };
console.log("Formation Pathways on STAGING (fictional data only):", staging.NEXT_PUBLIC_SUPABASE_URL);
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)], { stdio: "inherit", env });
next.on("exit", (code) => process.exit(code ?? 0));
