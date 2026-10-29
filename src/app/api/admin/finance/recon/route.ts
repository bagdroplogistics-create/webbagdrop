import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { loadAgents } from "@/lib/partners";
import type { Booking } from "@/lib/types";

/** Bank reconciliation — import the bank statement (CSV rows parsed client
 *  side), auto-match credits against the ledger (booking payments, agent
 *  remittances, wallet top-ups) by amount + date proximity, let the team
 *  confirm or match by hand, and keep the statement in settings doc
 *  "bankrecon". Mirrors Zoho Books' "uncategorized transactions" loop. */

export interface StatementRow {
  id: string;             // hash of date|desc|amount
  date: string;           // yyyy-mm-dd
  description: string;
  ref?: string;
  amount: number;         // +credit into the bank, −debit
  matchId?: string;       // booking id / remit:<agent> / topup:<agent>
  matchKind?: "booking" | "remittance" | "topup" | "manual";
  status: "unmatched" | "suggested" | "reconciled" | "ignored";
}

interface ReconDoc { rows: StatementRow[]; importedAt?: string; bankName?: string }

async function load(sb: NonNullable<ReturnType<typeof serviceClient>>): Promise<ReconDoc> {
  const { data } = await sb.from("settings").select("doc").eq("id", "bankrecon").maybeSingle();
  return ((data?.doc as ReconDoc | null) ?? { rows: [] });
}
async function save(sb: NonNullable<ReturnType<typeof serviceClient>>, doc: ReconDoc) {
  const { error } = await sb.from("settings").upsert({ id: "bankrecon", doc, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Ledger entries the bank credits should match. */
async function ledgerEntries(sb: NonNullable<ReturnType<typeof serviceClient>>) {
  const [{ data: bk }, agents] = await Promise.all([sb.from("bookings").select("doc"), loadAgents()]);
  const entries: { id: string; kind: StatementRow["matchKind"]; amount: number; date: string; label: string }[] = [];
  for (const r of bk ?? []) {
    const b = r.doc as Booking;
    if (b.pay?.status === "captured" && b.pay.amount > 0 && !b.pay.gateway?.startsWith("Partner ") && !b.pay.gateway?.startsWith("Agent collect"))
      entries.push({ id: b.id, kind: "booking", amount: b.pay.amount, date: b.pay.at.slice(0, 10), label: `${b.id} · ${b.traveller.name} (${b.pay.gateway})` });
  }
  for (const a of agents) {
    for (const r of a.remitted ?? []) entries.push({ id: `remit:${a.code}:${r.at}`, kind: "remittance", amount: r.amount, date: r.at.slice(0, 10), label: `Remittance · ${a.company}${r.note ? ` · ${r.note}` : ""}` });
    for (const t of a.wallet?.txns ?? []) if (t.amount > 0 && (t.kind === "topup" || t.kind === "settlement"))
      entries.push({ id: `topup:${a.code}:${t.at}`, kind: "topup", amount: t.amount, date: t.at.slice(0, 10), label: `${t.kind === "topup" ? "Wallet top-up" : "Settlement"} · ${a.company}${t.ref ? ` · ${t.ref}` : ""}` });
  }
  return entries;
}

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const [doc, entries] = await Promise.all([load(sb), ledgerEntries(sb)]);
  return NextResponse.json({ ...doc, ledger: entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200) });
}

type Body =
  | { action: "import"; bankName?: string; rows: { date: string; description: string; ref?: string; amount: number }[] }
  | { action: "setStatus"; id: string; status: StatementRow["status"]; matchId?: string; matchKind?: StatementRow["matchKind"] }
  | { action: "clear" };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  if (b.action === "clear") {
    await save(sb, { rows: [] });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "import") {
    const incoming = (b.rows ?? []).filter((r) => r.date && Number.isFinite(Number(r.amount))).slice(0, 2000);
    if (!incoming.length) return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });
    const doc = await load(sb);
    const entries = await ledgerEntries(sb);
    const usedMatches = new Set(doc.rows.filter((r) => r.matchId).map((r) => r.matchId));
    const existing = new Set(doc.rows.map((r) => r.id));
    let added = 0, suggested = 0;
    for (const r of incoming) {
      const id = `${r.date}|${(r.description ?? "").slice(0, 40)}|${r.amount}`;
      if (existing.has(id)) continue;
      const row: StatementRow = { id, date: r.date, description: (r.description ?? "").slice(0, 160), ref: r.ref?.slice(0, 60), amount: Math.round(Number(r.amount)), status: "unmatched" };
      /* auto-match: same amount, within 5 days, not already claimed */
      if (row.amount > 0) {
        const hit = entries.find((e) => e.amount === row.amount && !usedMatches.has(e.id) && dayDiff(e.date, row.date) <= 5);
        if (hit) { row.matchId = hit.id; row.matchKind = hit.kind; row.status = "suggested"; usedMatches.add(hit.id); suggested++; }
      }
      doc.rows.push(row); existing.add(id); added++;
    }
    doc.importedAt = new Date().toISOString();
    doc.bankName = b.bankName ?? doc.bankName;
    await save(sb, doc);
    return NextResponse.json({ ok: true, added, suggested, total: doc.rows.length });
  }

  if (b.action === "setStatus") {
    const doc = await load(sb);
    const row = doc.rows.find((r) => r.id === b.id);
    if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    row.status = b.status;
    if (b.matchId !== undefined) { row.matchId = b.matchId || undefined; row.matchKind = b.matchKind ?? (b.matchId ? "manual" : undefined); }
    if (b.status === "unmatched") { row.matchId = undefined; row.matchKind = undefined; }
    await save(sb, doc);
    return NextResponse.json({ ok: true, row });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
