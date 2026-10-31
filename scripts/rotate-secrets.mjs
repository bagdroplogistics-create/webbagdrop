#!/usr/bin/env node
/** Rotate the secrets in .env.local without ever showing them.
 *
 *   node scripts/rotate-secrets.mjs
 *
 * Asks for each key with hidden input (press Enter to keep the current one),
 * tests new Supabase keys against the database before saving, writes
 * .env.local atomically with owner-only permissions, and prints key NAMES
 * only. Generated values go to the clipboard (pbcopy), never the screen.
 * Afterwards: rebuild (NEXT_PUBLIC_* are baked in at build time), and when a
 * deploy is approved, scripts/push-env.py copies them to Vercel.
 */
import { readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV = join(dirname(dirname(fileURLToPath(import.meta.url))), ".env.local");
const lines = readFileSync(ENV, "utf8").split("\n");
const cur = Object.fromEntries(lines.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const next = {};

/* hidden prompt: raw-mode stdin, echoes nothing */
function ask(q) {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const s = process.stdin; let v = "";
    s.setRawMode(true); s.resume(); s.setEncoding("utf8");
    const on = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { s.setRawMode(false); s.pause(); s.off("data", on); process.stdout.write("\n"); return resolve(v.trim()); }
        if (c === "\u0003") { process.stdout.write("\ncancelled — nothing written\n"); process.exit(1); }
        if (c === "\u007f") v = v.slice(0, -1); else v += c;
      }
    };
    s.on("data", on);
  });
}
const gen = () => randomBytes(32).toString("base64url");
const copy = (v) => { try { execFileSync("pbcopy", { input: v }); return true; } catch { return false; } };

async function supabaseOk(url, key, table) {
  try { const r = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); return r.ok; } catch { return false; }
}

async function supabaseKey(name, url, table, prefix, what) {
  const v = await ask(`${name} — paste the new ${what} (Enter = keep): `);
  if (!v) return;
  if (!v.startsWith(prefix) && !v.startsWith("eyJ")) { console.log(`  ✗ doesn't look like a ${what} (expected ${prefix}…) — kept the old one`); return; }
  if (!(await supabaseOk(url, v, table))) { console.log("  ✗ Supabase rejected it — kept the old one"); return; }
  next[name] = v; console.log("  ✓ tested against Supabase");
}

console.log("Rotating secrets in .env.local — values are never shown.\n");

console.log("1) Supabase · TEST project (Dashboard → Project settings → API keys → create new keys)");
await supabaseKey("NEXT_PUBLIC_SUPABASE_ANON_KEY", cur.NEXT_PUBLIC_SUPABASE_URL, "events", "sb_publishable_", "publishable key");
await supabaseKey("SUPABASE_SERVICE_ROLE_KEY", cur.NEXT_PUBLIC_SUPABASE_URL, "bookings", "sb_secret_", "secret key");

console.log("\n2) Supabase · PRODUCTION project");
await supabaseKey("PROD_SUPABASE_SERVICE_ROLE_KEY", cur.PROD_SUPABASE_URL, "bookings", "sb_secret_", "secret key");

console.log("\n3) Production site admin API key (must equal the key set on the production Vercel project)");
const pk = await ask("PROD_ADMIN_API_KEY — paste it, type g to generate one, Enter = keep: ");
if (pk === "g") {
  const v = gen();
  if (copy(v)) { next.PROD_ADMIN_API_KEY = v; console.log("  ✓ generated and copied to your clipboard — paste it into the production project's admin key now"); }
  else console.log("  ✗ clipboard unavailable — kept the old one; re-run and paste your own");
}
else if (pk) { if (pk.length < 24) console.log("  ✗ under 24 characters — kept the old one"); else next.PROD_ADMIN_API_KEY = pk; }

console.log("\n4) Admin password (ADMIN_SECRET_KEY) — also signs admin sessions; everyone is logged out");
const a1 = await ask("New admin password, 14+ characters (Enter = keep): ");
if (a1) {
  const a2 = await ask("Type it again: ");
  if (a1 !== a2) console.log("  ✗ didn't match — kept the old one");
  else if (a1.length < 14) console.log("  ✗ under 14 characters — kept the old one");
  else next.ADMIN_SECRET_KEY = a1;
}

console.log("\n5) Quote signing secret — unpaid quote links issued before now stop working");
if ((await ask("Generate a new QUOTE_SIGNING_SECRET? (y/N): ")).toLowerCase() === "y") next.QUOTE_SIGNING_SECRET = gen();

if (!Object.keys(next).length) { console.log("\nNothing changed."); process.exit(0); }
const seen = new Set();
const out = lines
  .filter((l) => !/^VERCEL_OIDC_TOKEN=/.test(l))
  .map((l) => { const k = l.slice(0, l.indexOf("=")); if (k in next) { seen.add(k); return `${k}=${next[k]}`; } return l; });
for (const k of Object.keys(next)) if (!seen.has(k)) out.push(`${k}=${next[k]}`);
writeFileSync(ENV + ".tmp", out.join("\n"), { mode: 0o600 });
renameSync(ENV + ".tmp", ENV);
chmodSync(ENV, 0o600);
console.log(`\n✓ .env.local updated: ${Object.keys(next).join(", ")}`);
console.log("Next: rebuild and restart the local server, test, then (on deploy approval) run scripts/push-env.py.");
