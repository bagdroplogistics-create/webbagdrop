// End-to-end local test of /api/hooks/whatsapp — no real WhatsApp message
// sent, uses a fake wamid against a throwaway outbox row, cleans up after.
// Talks to Supabase's REST API directly (avoids @supabase/supabase-js's
// realtime client, which needs a native WebSocket Node 20 doesn't have).
// Run: node --env-file=.env.local scripts/webhook-test.mjs
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log("Supabase not configured locally."); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function rest(path, init) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const rowId = `webhooktest:${Date.now()}`;
const wamid = `wamid.TEST_${Date.now()}`;
const now = new Date().toISOString();

console.log("1. Inserting a throwaway outbox row...");
await rest("outbox", { method: "POST", body: JSON.stringify({ id: rowId, status: "done", created: now, doc: {
  kind: "send.wa", key: rowId, to: "9999999999", template: "test", text: "test", status: "done", attempts: 0, createdAt: now, waId: wamid,
} }) });
await rest("settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: `wa:${wamid}`, doc: { outboxId: rowId }, status: null, created: now }) });

console.log("2. POSTing a simulated Meta 'delivered' status event...");
const payload = { entry: [{ changes: [{ value: { statuses: [{ id: wamid, status: "delivered" }] } }] }] };
const r1 = await fetch("http://localhost:3000/api/hooks/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
console.log("   webhook responded:", r1.status, await r1.text());

console.log("3. Reading the outbox row back...");
const after = await rest(`outbox?id=eq.${encodeURIComponent(rowId)}&select=doc`);
console.log("   waStatus:", after[0]?.doc?.waStatus, "| waError:", after[0]?.doc?.waError ?? "(none)");

console.log("4. POSTing a simulated 'failed' status event...");
const payload2 = { entry: [{ changes: [{ value: { statuses: [{ id: wamid, status: "failed", errors: [{ title: "Re-engagement message", message: "Message failed to send because more than 24 hours have passed." }] }] } }] }] };
await fetch("http://localhost:3000/api/hooks/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload2) });
const after2 = await rest(`outbox?id=eq.${encodeURIComponent(rowId)}&select=doc`);
console.log("   waStatus:", after2[0]?.doc?.waStatus, "| waError:", after2[0]?.doc?.waError);

console.log("5. Cleaning up test rows...");
await rest(`outbox?id=eq.${encodeURIComponent(rowId)}`, { method: "DELETE" });
await rest(`settings?id=eq.${encodeURIComponent(`wa:${wamid}`)}`, { method: "DELETE" });
console.log("Done.");
