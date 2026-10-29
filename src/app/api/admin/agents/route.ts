import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { loadAgents, saveAgents, newAgentKey, ledgerFor, walletApply, gstinLooksValid, panLooksValid, type Agent } from "@/lib/partners";
import type { Booking } from "@/lib/types";

/** Admin management of B2B agents: create/edit agents with their
 *  commission (percentage or fixed per bag — set only here, never by the
 *  agent), rotate access keys, see each agent's ledger, and record
 *  remittances when the agent pays Bagdrop. */

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const [agents, bk] = await Promise.all([loadAgents(), sb.from("bookings").select("doc")]);
  const bookings = (bk.data ?? []).map((r) => r.doc as Booking);
  return NextResponse.json({
    agents: agents.map((a) => ({ ...a, ledger: ledgerFor(a, bookings) })),
  });
}

type Body =
  | { action: "save"; agent: Partial<Agent> & { name: string; company: string; mobile: string } }
  | { action: "delete"; id: string }
  | { action: "rotateKey"; id: string }
  | { action: "remit"; id: string; amount: number; note?: string }
  /* wallet/credit trial — admin records money movements by hand (NEFT/UPI refs) */
  | { action: "walletTxn"; id: string; amount: number; kind: "topup" | "settlement" | "adjust"; ref?: string; note?: string }
  | { action: "payout"; id: string; amount: number; note?: string };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  let agents = await loadAgents();

  if (b.action === "save") {
    const existing = b.agent.id ? agents.find((a) => a.id === b.agent.id) : undefined;
    const code = (b.agent.code ?? existing?.code ?? `AG-${b.agent.company.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "PARTNER"}`).toUpperCase();
    if (agents.some((a) => a.code === code && a.id !== b.agent.id)) return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    const gstin = b.agent.gstin?.trim().toUpperCase() || undefined;
    const pan = b.agent.pan?.trim().toUpperCase() || undefined;
    if (!gstinLooksValid(gstin)) return NextResponse.json({ error: "BAD_GSTIN", detail: "GSTIN format looks wrong — 15 characters, e.g. 24ABCDE1234F1Z5." }, { status: 400 });
    if (!panLooksValid(pan)) return NextResponse.json({ error: "BAD_PAN", detail: "PAN format looks wrong — e.g. ABCDE1234F." }, { status: 400 });
    const billingIn = b.agent.billing;
    const agent: Agent = {
      id: existing?.id ?? newToken("AGT", 6),
      name: b.agent.name, company: b.agent.company,
      type: (b.agent.type as Agent["type"]) ?? "travel agent",
      mobile: b.agent.mobile, email: b.agent.email,
      gstin, pan,
      address: b.agent.address?.trim() || undefined,
      city: b.agent.city?.trim() || undefined,
      state: b.agent.state?.trim() || undefined,
      bank: b.agent.bank ?? existing?.bank,
      code,
      key: existing?.key ?? newAgentKey(),
      commission: b.agent.commission ?? existing?.commission ?? { mode: "pct", value: 10 },
      billing: billingIn
        ? { mode: billingIn.mode ?? "remit", creditLimit: Math.max(0, Math.round(Number(billingIn.creditLimit) || 0)) }
        : existing?.billing,
      wallet: existing?.wallet,
      commissionPayouts: existing?.commissionPayouts,
      remitted: existing?.remitted ?? [],
      created: existing?.created ?? new Date().toISOString(),
    };
    agents = [...agents.filter((a) => a.id !== agent.id), agent];
    await saveAgents(agents);
    return NextResponse.json({ ok: true, agent });
  }
  if (b.action === "delete") {
    await saveAgents(agents.filter((a) => a.id !== b.id));
    return NextResponse.json({ ok: true });
  }
  if (b.action === "rotateKey") {
    const a = agents.find((x) => x.id === b.id);
    if (!a) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    a.key = newAgentKey();
    await saveAgents(agents);
    return NextResponse.json({ ok: true, agent: a });
  }
  if (b.action === "remit") {
    const a = agents.find((x) => x.id === b.id);
    if (!a) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const amount = Math.round(Number(b.amount) || 0);
    if (amount <= 0) return NextResponse.json({ error: "BAD_AMOUNT" }, { status: 400 });
    a.remitted = [...(a.remitted ?? []), { at: new Date().toISOString(), amount, note: b.note }];
    await saveAgents(agents);
    return NextResponse.json({ ok: true, agent: a });
  }
  if (b.action === "walletTxn") {
    const a = agents.find((x) => x.id === b.id);
    if (!a) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const amount = Math.round(Number(b.amount) || 0);
    if (!amount) return NextResponse.json({ error: "BAD_AMOUNT" }, { status: 400 });
    if ((b.kind === "topup" || b.kind === "settlement") && amount < 0) return NextResponse.json({ error: "BAD_AMOUNT", detail: "Top-ups and settlements are positive — use adjust for corrections." }, { status: 400 });
    const next = walletApply(a, { amount, kind: b.kind, ref: b.ref, note: b.note });
    await saveAgents(agents.map((x) => (x.id === next.id ? next : x)));
    return NextResponse.json({ ok: true, agent: next, balance: next.wallet?.balance ?? 0 });
  }
  if (b.action === "payout") {
    const a = agents.find((x) => x.id === b.id);
    if (!a) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const amount = Math.round(Number(b.amount) || 0);
    if (amount <= 0) return NextResponse.json({ error: "BAD_AMOUNT" }, { status: 400 });
    a.commissionPayouts = [...(a.commissionPayouts ?? []), { at: new Date().toISOString(), amount, note: b.note }];
    await saveAgents(agents);
    return NextResponse.json({ ok: true, agent: a });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
