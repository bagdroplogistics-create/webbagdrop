#!/usr/bin/env python3
"""Push the platform's env secrets from .env.local to the linked Vercel
project (bagdrop-platform), production + preview. Values are piped to the
Vercel CLI and never printed. Also generates CRON_SECRET if missing."""
import os, re, secrets, subprocess, sys
os.environ["PATH"] = os.path.expanduser("~/.local/node/bin") + os.pathsep + os.environ.get("PATH", "")

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
vals = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
    if m:
        vals[m.group(1)] = m.group(2).strip().strip('"')

if not vals.get("CRON_SECRET"):
    vals["CRON_SECRET"] = secrets.token_urlsafe(24)
    with open(".env.local", "a") as f:
        f.write(f"\nCRON_SECRET={vals['CRON_SECRET']}\n")

KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY", "QUOTE_SIGNING_SECRET",
        "ADMIN_SECRET_KEY", "CRON_SECRET"]
fails = 0
for k in KEYS:
    if not vals.get(k):
        print(f"{k}: MISSING in .env.local"); fails += 1; continue
    for env in ("production", "preview"):
        r = subprocess.run(["npx", "-y", "vercel@64.5.0", "env", "add", k, env],
                           input=vals[k] + "\n", capture_output=True, text=True)
        out = (r.stdout + r.stderr).replace(vals[k], "***")
        if "Added" in out or "already" in out.lower():
            print(f"{k} [{env}]: OK")
        else:
            print(f"{k} [{env}]: FAIL rc={r.returncode} {out[-160:]}"); fails += 1

print("\n--- verification: what the project now holds ---")
r = subprocess.run(["npx", "-y", "vercel@64.5.0", "env", "ls", "production"],
                   capture_output=True, text=True)
listed = [k for k in KEYS if k in (r.stdout + r.stderr)]
print("present:", ", ".join(listed) or "NONE")
missing = [k for k in KEYS if k not in listed]
if missing:
    print("MISSING:", ", ".join(missing)); fails += 1
sys.exit(1 if fails else 0)
