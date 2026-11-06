// One-off diagnostic: calls Meta's WhatsApp Cloud API exactly like sendWhatsAppOtp()
// does, and prints ONLY the HTTP status + response body (never the token).
// Run: node --env-file=.env.local scripts/wa-otp-diag.mjs <mobile>
const mobile = process.argv[2];
if (!mobile) { console.error("usage: node --env-file=.env.local scripts/wa-otp-diag.mjs <mobile>"); process.exit(1); }

const token = process.env.META_WHATSAPP_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_ID;
const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
const templateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en";
const hasButton = process.env.WHATSAPP_OTP_TEMPLATE_HAS_BUTTON === "1";

console.log("Config present:", {
  hasToken: !!token,
  hasPhoneId: !!phoneId,
  templateName: templateName || "(not set)",
  templateLang,
  hasButton,
});

if (!token || !phoneId) { console.log("RESULT: not configured — can't test."); process.exit(0); }

const msisdn = mobile.replace(/\D/g, "").replace(/^(?!91)/, "91");
const code = "482913";
const components = [{ type: "body", parameters: [{ type: "text", text: code }] }];
if (hasButton) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] });

const body = templateName
  ? { messaging_product: "whatsapp", to: msisdn, type: "template", template: { name: templateName, language: { code: templateLang }, components } }
  : { messaging_product: "whatsapp", to: msisdn, type: "text", text: { body: `${code} is your Bagdrop verification code. Valid 10 minutes — never share it.` } };

console.log("Sending as:", templateName ? "TEMPLATE" : "FREE-FORM TEXT", "to", msisdn);

const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await r.text();
console.log("HTTP status:", r.status);
console.log("Response body:", text);
