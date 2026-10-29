import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { loadAgents, saveAgents, makePartnerToken, partnerIdFromCookies, ledgerFor, commissionFor, billingMode, walletApply, type Agent } from "@/lib/partners";
import { makeQuotedBooking } from "@/lib/quoteFactory";
import { loadMasters } from "@/lib/pricingSettings";
import { quote } from "@/lib/pricing";
import { notify, kickSweep } from "@/lib/automation";
import type { Booking, CrmActivity, Inquiry, Mode, UseCase } from "@/lib/types";

/** The B2B partner portal API — login, retail-rate booking (agent collects
 *  from the client, remits net of commission to Bagdrop), the live ledger
 *  with per-booking tracking, and bulk uploads that become a rate inquiry
 *  for the Bagdrop team (bulk is never auto-priced at retail). */

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: {
    action?: "login" | "logout" | "data" | "book" | "bulk" | "preview";
    code?: string; key?: string;
    booking?: {
      name: string; mobile: string; email?: string; fromName: string; toName: string;
      bags: number; oversize?: number; date?: string; pickAddr?: string; dropAddr?: string; note?: string;
      uc?: UseCase; ucName?: string; mode?: Mode; slot?: string; flight?: string;
    };
    preview?: { fromName: string; toName: string; bags: number; oversize?: number; mode?: Mode; date?: string };
    rows?: { name: string; mobile: string; fromName: string; toName: string; bags: number; date?: string }[];
    note?: string;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  /* ---------- login (no session needed) ---------- */
  if (b.action === "login") {
    const agents = await loadAgents();
    const a = agents.find((x) => x.code.toUpperCase() === (b.code ?? "").trim().toUpperCase() && x.key === (b.key ?? "").trim());
    if (!a) return NextResponse.json({ error: "WRONG_CREDENTIALS" }, { status: 401 });
    const res = NextResponse.json({ ok: true, agent: { id: a.id, name: a.name, company: a.company, type: a.type, commission: a.commission } });
    res.cookies.set("bagdrop_partner", makePartnerToken(a.id), { httpOnly: true, sameSite: "lax", secure: true, maxAge: 7 * 24 * 3600, path: "/" });
    return res;
  }
  if (b.action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("bagdrop_partner", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  }

  /* ---------- everything below needs a partner session ---------- */
  const agentId = partnerIdFromCookies(req.headers.get("cookie"));
  if (!agentId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const agents = await loadAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (b.action === "data") {
    const [bk, masters] = await Promise.all([sb.from("bookings").select("doc"), loadMasters()]);
    const bookings = (bk.data ?? []).map((r) => r.doc as Booking);
    const ledger = ledgerFor(agent, bookings);
    return NextResponse.json({
      agent: {
        id: agent.id, name: agent.name, company: agent.company, type: agent.type,
        commission: agent.commission, remitted: agent.remitted,
        gstin: agent.gstin, billing: { mode: billingMode(agent), creditLimit: agent.billing?.creditLimit ?? 0 },
        walletTxns: (agent.wallet?.txns ?? []).slice(-25).reverse(),
        commissionPayouts: agent.commissionPayouts ?? [],
      },
      ledger,
      /* the RETAIL rate chart, exactly what website customers pay */
      rates: masters.routes.map((r) => ({ from: r.from, to: r.to, r1: r.r1, r2: r.r2, addl: r.addl })),
      cities: masters.cities.map((c) => c.name),
      /* per-booking tracking detail for this agent's bookings */
      tracking: ledger.rows.map((row) => {
        const full = bookings.find((x) => x.id === row.id)!;
        return { id: row.id, status: full.status, events: full.events.slice(-4), slot: full.slot, date: full.date, verified: !!full.identity?.ok };
      }),
    });
  }

  /* live server-priced preview — the SAME quote() + live masters the booking
   * will use, so what the agent sees is exactly what is charged */
  if (b.action === "preview") {
    const p = b.preview;
    if (!p?.fromName || !p?.toName) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const masters = await loadMasters();
    const q = quote({ fromName: p.fromName, toName: p.toName, bags: Math.max(1, Number(p.bags) || 1), oversize: Math.max(0, Number(p.oversize) || 0), mode: p.mode ?? "road", date: p.date }, masters);
    if ("error" in q) return NextResponse.json({ ror: true });
    const commission = agent.commission.mode === "pct" ? Math.round((q.total * agent.commission.value) / 100) : Math.round(agent.commission.value * q.billed);
    return NextResponse.json({ ror: false, total: q.total, base: q.base, oversize: q.oversize, gst: q.gst, billed: q.billed, perBag: q.perBag, commission, net: q.total - commission, billingMode: billingMode(agent) });
  }

  if (b.action === "book") {
    const r = b.booking;
    if (!r?.name || !r?.mobile || !r?.fromName || !r?.toName) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const { doc, ror, total } = await makeQuotedBooking({ ...r, source: `b2b:${agent.code}` });
    if (ror) {
      return NextResponse.json({ error: "ROUTE_NOT_PRICED", detail: "This route is not on the retail chart — send it as a bulk/rate inquiry and the Bagdrop team will price it for you." }, { status: 422 });
    }
    const now = new Date().toISOString();
    const commission = commissionFor(agent, doc);
    const mode = billingMode(agent);

    /* ---- billing: remit (default) | prepaid wallet | credit line ----
     * wallet/credit charge the FULL RETAIL; the commission accrues as
     * payable back to the agent (paid out by Bagdrop separately). */
    let gateway = `Agent collect · ${agent.company} (remit due)`;
    let charged: Agent | null = null;
    if (mode === "wallet") {
      const bal = agent.wallet?.balance ?? 0;
      if (bal < total) {
        return NextResponse.json({ error: "INSUFFICIENT_WALLET", detail: `Wallet balance ${inr(bal)} is short of the retail ${inr(total)} — top up ${inr(total - bal)} (NEFT/UPI to Bagdrop, your account manager records it) or switch this booking to remit.` }, { status: 402 });
      }
      gateway = `Partner wallet · ${agent.company}`;
    } else if (mode === "credit") {
      const bal = agent.wallet?.balance ?? 0;
      const limit = agent.billing?.creditLimit ?? 0;
      if (bal - total < -limit) {
        return NextResponse.json({ error: "CREDIT_LIMIT_EXCEEDED", detail: `This booking needs ${inr(total)} but only ${inr(limit + bal)} of your ${inr(limit)} credit line is available — settle your balance with Bagdrop first.` }, { status: 402 });
      }
      gateway = `Partner credit · ${agent.company}`;
    }

    const paid: Booking = {
      ...doc, status: "submitted",
      /* the travelling CLIENT still verifies Aadhaar before pickup — the
       * automatic verify_identity message carries them the /verify link */
      identity: { ok: false, at: "", method: "UIDAI Aadhaar OTP · pending (required before pickup)", score: 0 },
      pay: { mode: "full", amount: total, status: "captured", gateway, at: now },
      admin: { ...doc.admin, agentId: agent.id, agentCode: agent.code, agentCommission: commission, agentBilling: mode },
      events: [...doc.events, {
        at: now, by: "admin",
        text: mode === "remit"
          ? `B2B booking by ${agent.company} (${agent.code}) · retail ${inr(total)} · commission ${inr(commission)} · net remit ${inr(total - commission)}`
          : `B2B booking by ${agent.company} (${agent.code}) · retail ${inr(total)} charged to partner ${mode} · commission ${inr(commission)} accrues to agent`,
      }],
    };
    const { error } = await sb.from("bookings").upsert({ id: paid.id, doc: paid, status: paid.status, created: paid.created });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* debit the wallet/credit AFTER the booking is safely stored */
    if (mode !== "remit") {
      charged = walletApply(agent, { amount: -total, kind: "booking", bookingId: paid.id, note: `${r.fromName} → ${r.toName} · ${r.name}` });
      await saveAgents(agents.map((x) => (x.id === charged!.id ? charged! : x)));
    }

    /* client gets the booking confirmation pair; the agent sees it in the ledger */
    await notify("payment_received", { name: r.name, mobile: r.mobile, email: r.email },
      { lane: `${r.fromName} → ${r.toName}`, ref: paid.id, amount: inr(total) }, `ack:${paid.id}`);
    kickSweep();
    return NextResponse.json({
      ok: true, id: paid.id, retail: total, commission, net: total - commission,
      billing: mode, walletBalance: charged?.wallet?.balance ?? agent.wallet?.balance ?? 0,
      verifyLink: `/verify/${paid.id}`,
    });
  }

  if (b.action === "bulk") {
    const rows = (b.rows ?? []).filter((r) => r.name && r.mobile && r.fromName && r.toName).slice(0, 1000);
    if (!rows.length) return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });
    const now = new Date().toISOString();
    const lanes = [...new Set(rows.map((r) => `${r.fromName} → ${r.toName}`))];
    const totalBags = rows.reduce((s, r) => s + (Number(r.bags) || 1), 0);
    /* one rate inquiry for the Bagdrop team — bulk is priced by humans */
    const inq: Inquiry = {
      id: `INQ-B2B-${Date.now().toString(36).toUpperCase()}`, created: now, status: "new",
      contact: { name: agent.name, role: `${agent.type} · ${agent.company} (${agent.code})`, mobile: agent.mobile, email: agent.email },
      bags: totalBags, families: rows.length,
      pickupCities: lanes, venue: b.note ?? `Bulk upload · ${rows.length} passengers`,
    };
    await sb.from("inquiries").upsert({ id: inq.id, doc: inq, status: inq.status, created: now });
    /* every row parked as a rate-pending lead, tagged to the agent */
    const leads = rows.map((r, i) => {
      const lead: CrmActivity = {
        id: `CRM-B2B-${inq.id.slice(-6)}-${i}`, created: now, kind: "lead", stage: "new",
        text: `Lead · ${r.name} (${r.fromName} → ${r.toName})`, value: 0,
        mobile: r.mobile, contact: r.mobile, source: `b2b:${agent.code}`, campaign: agent.company,
        route: { from: r.fromName, to: r.toName, bags: Number(r.bags) || 1, date: r.date },
        ratePending: true, refId: inq.id, followKey: `b2b:${inq.id}:${i}`,
      };
      return { id: lead.id, doc: lead, status: null, created: now };
    });
    const { error } = await sb.from("crm").upsert(leads, { onConflict: "id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    kickSweep();
    return NextResponse.json({ ok: true, inquiry: inq.id, passengers: rows.length, bags: totalBags, lanes });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
