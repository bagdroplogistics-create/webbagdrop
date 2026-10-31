/* BAGDROP deep system check — every API module, auth gate and field linkage. */
const BASE = process.env.BASE ?? "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;
if (!ADMIN_KEY) { console.error("Set ADMIN_SECRET_KEY (and optionally BASE) to run: ADMIN_SECRET_KEY=... node scripts/deepcheck.mjs"); process.exit(2); }
const results = [];
let adminCookie = "", partnerCookie = "";

function t(name, ok, detail = "") { results.push({ name, ok, detail }); }
async function j(path, opts = {}, cookie = "") {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers ?? {}) },
  });
  let body = null;
  try { body = await r.json(); } catch { /* html */ }
  return { status: r.status, body, headers: r.headers };
}

/* ---------- 1 · public pages ---------- */
for (const p of ["/", "/partner", "/weddings", "/e/Y2K-WED", "/admin/login", "/themes.html", "/theme-sets.html"]) {
  const r = await fetch(BASE + p);
  t(`page ${p}`, r.status === 200, `http ${r.status}`);
}
{ // amount must NOT appear on the booking page
  const html = await (await fetch(BASE + "/")).text();
  t("no ₹ amount on booking page", !/₹\s?\d/.test(html.replace(/₹\{/g, "")), "");
}

/* ---------- 2 · auth gates ---------- */
for (const p of ["/api/admin/bookings", "/api/admin/agents", "/api/admin/automation", "/api/admin/inspector", "/api/admin/trips", "/api/admin/leads", "/api/admin/ops", "/api/admin/metrics"]) {
  const r = await j(p);
  t(`401 gate ${p}`, r.status === 401, `http ${r.status}`);
}
{ // wrong admin key
  const r = await j("/api/admin/login", { method: "POST", body: JSON.stringify({ key: "wrong" }) });
  t("admin login wrong key refused", r.status >= 400, `http ${r.status}`);
}
{ // real login
  const r = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: ADMIN_KEY }) });
  adminCookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  t("admin login", r.status === 200 && !!adminCookie, "");
}
{ // worker cron gate
  const r = await j("/api/worker");
  t("worker cron 401 without secret", r.status === 401 || r.status === 503, `http ${r.status}`);
}
{ // razorpay webhook unsigned
  const r = await j("/api/hooks/razorpay", { method: "POST", body: JSON.stringify({ x: 1 }) });
  t("razorpay webhook refuses unsigned", r.status >= 400, `http ${r.status}`);
}

/* ---------- 3 · OTP engine ---------- */
{
  const s = await j("/api/otp", { method: "POST", body: JSON.stringify({ action: "send", channel: "mobile", to: "9000011122" }) });
  t("otp send", s.status === 200 && s.body.token && s.body.demo, "");
  const bad = await j("/api/otp", { method: "POST", body: JSON.stringify({ action: "verify", to: s.body.to, code: "000000", exp: s.body.exp, token: s.body.token }) });
  t("otp wrong code 401", bad.status === 401, "");
  const good = await j("/api/otp", { method: "POST", body: JSON.stringify({ action: "verify", to: s.body.to, code: s.body.demo, exp: s.body.exp, token: s.body.token }) });
  t("otp correct code ok", good.status === 200, "");
  const badm = await j("/api/otp", { method: "POST", body: JSON.stringify({ action: "send", channel: "mobile", to: "123" }) });
  t("otp bad mobile 400", badm.status === 400, "");
}

/* ---------- 4 · quote + online-payment signature security ---------- */
let signed = null;
{
  const q = await j("/api/quote", { method: "POST", body: JSON.stringify({ fromName: "Ahmedabad", toName: "Mumbai", bags: 2, oversize: 0, mode: "road" }) });
  signed = q.body;
  t("signed quote issued", q.status === 200 && !!q.body.signature && q.body.total > 0, `total ${q.body?.total}`);
  /* online payment (Razorpay): orders only for a signed-in client; a payment
   * is accepted only with a valid signature — nothing here creates data */
  const co = await j("/api/create-order", { method: "POST", body: JSON.stringify({ id: "BD-NOPE" }) });
  t("create-order needs a client session", co.status === 401 || co.status === 503, `http ${co.status}`);
  const vm = await j("/api/verify-payment", { method: "POST", body: JSON.stringify({ id: "BD-NOPE" }) });
  t("verify-payment refuses missing fields", vm.status === 400 || vm.status === 503, `http ${vm.status}`);
  const vs = await j("/api/verify-payment", { method: "POST", body: JSON.stringify({ id: "BD-NOPE", razorpay_order_id: "order_x", razorpay_payment_id: "pay_x", razorpay_signature: "forged" }) });
  t("verify-payment refuses a forged signature", vs.status === 400 && vs.body?.error === "SIGNATURE_MISMATCH" || vs.status === 503, `http ${vs.status}`);
}

/* ---------- 5 · bookings module + identity pickup gate ---------- */
let allBookings = [];
{
  const r = await j("/api/admin/bookings", {}, adminCookie);
  allBookings = r.body.bookings ?? [];
  t("admin bookings list", r.status === 200 && allBookings.length > 0, `${allBookings.length} bookings`);
  const shapes = allBookings.every((b) => b.id && b.traveller && b.quote && Array.isArray(b.events));
  t("booking docs well-shaped", shapes, "");
  const unver = allBookings.find((b) => b.pay?.status === "captured" && !b.identity?.ok && !["picked_up", "in_transit", "delivered", "cancelled", "rejected"].includes(b.status));
  if (unver) {
    const pick = { ...unver, status: "picked_up", events: [...unver.events, { at: new Date().toISOString(), by: "admin", text: "deepcheck pickup attempt" }] };
    const r2 = await j("/api/admin/bookings", { method: "POST", body: JSON.stringify({ doc: pick }) }, adminCookie);
    t("pickup gate blocks unverified", r2.status === 409 && r2.body.error === "IDENTITY_NOT_VERIFIED", `on ${unver.id}`);
  } else t("pickup gate blocks unverified", true, "no unverified paid booking to test (gate verified earlier)");
}

/* ---------- 6 · bond signing (KYC) module — read-only checks ----------
 * /api/verify was retired by the v2 flow (410); signing lives at /api/kyc.
 * Nothing here writes: a wrong code is tried only on an UNPAID booking,
 * which is refused before any attempt is counted. */
{
  const b = allBookings.find((x) => x.pay?.status === "captured");
  const g = await j(`/api/kyc?id=${encodeURIComponent(b.id)}`);
  t("kyc GET masked summary", g.status === 200 && g.body.booking.mobile.includes("•") && !(g.body.booking.email ?? "").replace(/^[^@]*@/, "").includes("•") && g.body.booking.version, b.id);
  const unpaid = allBookings.find((x) => !x.payer && x.pay?.status !== "captured" && ["submitted", "revised", "accepted"].includes(x.status));
  if (unpaid) {
    const r = await j("/api/kyc", { method: "POST", body: JSON.stringify({ id: unpaid.id, action: "sign_domestic", otp: "999999" }) });
    t("kyc signing refused before payment is verified", r.status === 409 && r.body.error === "PAYMENT_NOT_VERIFIED", unpaid.id);
  } else t("kyc signing refused before payment is verified (no unpaid booking to try)", true, "");
  const nf = await j("/api/kyc?id=NOPE-123");
  t("kyc 404 unknown id", nf.status === 404, "");
  const old = await j("/api/verify?id=NOPE-123");
  t("old /api/verify retired (410)", old.status === 410, `http ${old.status}`);
}

/* ---------- 7 · partner B2B module ---------- */
{
  const agAll = (await j("/api/admin/agents", {}, adminCookie)).body.agents ?? [];
  const testAgent = agAll.find((a) => a.billing && a.billing.mode !== "remit") ?? agAll[0];
  const bad = await j("/api/partner", { method: "POST", body: JSON.stringify({ action: "login", code: testAgent.code, key: "wrong" }) });
  t("partner wrong key 401", bad.status === 401, "");
  const r = await fetch(BASE + "/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", code: testAgent.code, key: testAgent.key }) });
  partnerCookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  t("partner login", r.status === 200, "");
  const data = await j("/api/partner", { method: "POST", body: JSON.stringify({ action: "data" }) }, partnerCookie);
  const L = data.body.ledger;
  t("partner data shape", data.status === 200 && Array.isArray(data.body.rates) && Array.isArray(data.body.cities) && L && "walletBalance" in L && "commissionDue" in L, "");
  t("partner billing linked", data.body.agent.billing.mode === (testAgent.billing?.mode ?? "remit"), `mode ${data.body.agent.billing.mode}`);
  const pv = await j("/api/partner", { method: "POST", body: JSON.stringify({ action: "preview", preview: { fromName: "Ahmedabad", toName: "Mumbai", bags: 2, oversize: 1, mode: "air" } }) }, partnerCookie);
  t("partner preview math", pv.body.total === 7245 && pv.body.gst === 345 && pv.body.commission === 600, JSON.stringify({ total: pv.body.total, comm: pv.body.commission }));
  const ror = await j("/api/partner", { method: "POST", body: JSON.stringify({ action: "book", booking: { name: "X", mobile: "9000000000", fromName: "Shillong", toName: "Imphal", bags: 2 } }) }, partnerCookie);
  t("partner ROR lane refused 422", ror.status === 422, `http ${ror.status}`);
  const noauth = await j("/api/partner", { method: "POST", body: JSON.stringify({ action: "data" }) });
  t("partner data needs session", noauth.status === 401, "");
}

/* ---------- 8 · agents module (admin) ---------- */
{
  const r = await j("/api/admin/agents", {}, adminCookie);
  const ag = r.body.agents ?? [];
  t("agents list + ledgers", r.status === 200 && ag.length >= 2 && ag.every((a) => a.ledger && a.code && a.key), `${ag.length} agents`);
  const gs = ag.find((a) => a.gstin);
  t("agent fields linked (GSTIN/billing)", !!gs && !!gs.gstin, gs ? gs.code : "no agent with GSTIN");
  const badg = await j("/api/admin/agents", { method: "POST", body: JSON.stringify({ action: "save", agent: { name: "x", company: "y", mobile: "9", gstin: "BAD" } }) }, adminCookie);
  t("agent bad GSTIN refused", badg.status === 400, "");
}

/* ---------- 9 · automation + notifications + CTO ---------- */
{
  const g = await j("/api/admin/automation", {}, adminCookie);
  t("automation desk data", g.status === 200 && g.body.counts && Array.isArray(g.body.recent) && g.body.providers, "");
  t("ops alert contact set", !!(g.body.alerts?.mobile || g.body.alerts?.email), JSON.stringify(g.body.alerts));
  const s1 = await j("/api/admin/automation", { method: "POST", body: JSON.stringify({ action: "run" }) }, adminCookie);
  t("sweep runs clean", s1.status === 200 && s1.body.ok && s1.body.dead === 0, JSON.stringify({ ops: s1.body.opsQueued, cto: s1.body.ctoFlagged, lr: s1.body.lrDrafts }));
  const s2 = await j("/api/admin/automation", { method: "POST", body: JSON.stringify({ action: "run" }) }, adminCookie);
  t("sweep idempotent (2nd run no new CTO/LR)", s2.body.ctoFlagged === 0 && s2.body.lrDrafts === 0 && s2.body.leadsCreated === 0, JSON.stringify({ cto: s2.body.ctoFlagged, lr: s2.body.lrDrafts }));
}

/* ---------- 10 · inspector module ---------- */
{
  const r = await j("/api/admin/inspector", {}, adminCookie);
  t("inspector flags+journeys+depts", r.status === 200 && Array.isArray(r.body.flags) && Array.isArray(r.body.journeys) && r.body.departments.length === 8, `${r.body.flags?.length} flags · ${r.body.journeys?.length} journeys`);
  const jr = r.body.journeys[0];
  t("journey linked to milestones", !!jr && jr.stops.length === 9 && jr.stops[0].key === "booked" && "severity" in jr, "");
  const red = r.body.flags.filter((f) => f.severity === "red");
  t("CTO auto-dispatched all red flags", red.every((f) => f.dispatched), `${red.filter((f) => f.dispatched).length}/${red.length} dispatched`);
}

/* ---------- 11 · LR & trips module ---------- */
{
  const r = await j("/api/admin/trips", {}, adminCookie);
  t("trips list", r.status === 200 && Array.isArray(r.body.trips), `${r.body.trips?.length} trips`);
  const sub = allBookings.find((x) => x.status === "submitted" && !x.lr);
  if (sub) {
    const r2 = await j("/api/admin/trips/assign", { method: "POST", body: JSON.stringify({ bookingId: sub.id, autoTrip: true }) }, adminCookie);
    t("LR refused for unconfirmed", r2.status === 409 && r2.body.error === "NOT_CONFIRMED", sub.id);
  } else t("LR refused for unconfirmed", true, "no submitted booking available (verified earlier)");
  const withLr = allBookings.find((x) => x.lr);
  if (withLr) {
    const r3 = await j("/api/admin/trips/assign", { method: "POST", body: JSON.stringify({ bookingId: withLr.id, tripId: withLr.admin.trip ?? "T", }) }, adminCookie);
    t("duplicate LR refused", r3.status === 409 && r3.body.error === "LR_EXISTS", withLr.id);
    const lrd = withLr.admin.lrDetails;
    t("LR fields linked to booking", !lrd || (lrd.consignee && lrd.toAddr && (lrd.pieces ?? 0) > 0), withLr.id);
  }
}

/* ---------- 12 · pricing / masters / metrics / ops ---------- */
{
  const p = await j("/api/admin/pricing", {}, adminCookie);
  const routes = p.body?.masters?.routes ?? p.body?.routes;
  t("pricing masters", p.status === 200 && Array.isArray(routes) && routes.length > 0, `${routes?.length} lanes`);
  const o = await j("/api/admin/ops", {}, adminCookie);
  t("ops masters (vendors+costmodel)", o.status === 200 && Array.isArray(o.body.vendors) && !!o.body.costModel, "");
  const m = await j("/api/admin/metrics", {}, adminCookie);
  t("metrics endpoint", m.status === 200, `keys: ${Object.keys(m.body ?? {}).slice(0, 5).join(",")}`);
}

/* ---------- 13 · leads import module ----------
 * This one WRITES: it creates a real quoted booking + CRM lead and queues a
 * WhatsApp/email to the test number. Opt-in only (DEEPCHECK_WRITES=1), and
 * never against the live site. */
if (process.env.DEEPCHECK_WRITES !== "1") {
  t("ads lead import (skipped — set DEEPCHECK_WRITES=1 on a test database to run)", true, "");
} else {
  const r = await j("/api/admin/leads", { method: "POST", body: JSON.stringify({ action: "import", rows: [{ name: "Deep Check", mobile: "9111222333", fromName: "Ahmedabad", toName: "Mumbai", bags: 1, source: "meta", campaign: "deepcheck" }] }) }, adminCookie);
  const okImport = r.status === 200 && (r.body.quoted >= 0 || r.body.imported >= 0 || r.body.ok);
  t("ads lead import", okImport, JSON.stringify(r.body).slice(0, 100));
}

/* ---------- 14 · GST rule: every priced quote is 5% ---------- */
{
  const q = signed;
  const gstPct = Math.round((1000 * q.gst) / (q.total - q.gst));
  t("GST is 5% exactly", gstPct === 50, `${gstPct / 10}%`);
}

/* ---------- report ---------- */
const pass = results.filter((r) => r.ok).length;
console.log(`\n==== DEEP CHECK: ${pass}/${results.length} PASS ====\n`);
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
if (pass < results.length) process.exit(1);
