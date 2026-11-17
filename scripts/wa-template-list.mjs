// Lists this WABA's message templates (name, language, status) — no secrets printed.
// Run: node --env-file=.env.local scripts/wa-template-list.mjs
const token = process.env.META_WHATSAPP_TOKEN;
const wabaId = process.argv[2] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
if (!token) { console.log("No token configured."); process.exit(0); }
if (!wabaId) { console.error("usage: node --env-file=.env.local scripts/wa-template-list.mjs <wabaId>"); process.exit(1); }

const r = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,language,status,category`, {
  headers: { Authorization: `Bearer ${token}` },
});
const j = await r.json();
console.log("HTTP status:", r.status);
console.log(JSON.stringify(j, null, 2));
