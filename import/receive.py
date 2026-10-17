#!/usr/bin/env python3
"""One-shot local receiver: the logged-in bagdrop.co admin page POSTs its own
export here; files land in this folder. Localhost only, CORS open, no auth —
run only for the seconds the import takes."""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1] if len(sys.argv) > 1 else "."

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome Private Network Access: a public https page may call localhost
        # only when the preflight answers this header.
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        name = self.path.strip("/").replace("/", "_") or "data"
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        try:
            parsed = json.loads(body)
            with open(f"{OUT}/{name}.json", "w") as f:
                json.dump(parsed, f)
            msg = f"saved {name}.json ({len(body)} bytes)"
            code = 200
        except Exception as e:
            msg, code = str(e), 400
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"ok": code == 200, "msg": msg}).encode())
        print(msg, flush=True)

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", 8787), H).serve_forever()
