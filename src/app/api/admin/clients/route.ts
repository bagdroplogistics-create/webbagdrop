import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import {
  loadClientRecords, saveClientRecords, deriveClients,
  cleanMobile, cleanEmail, cleanDob, CLIENT_CATEGORIES,
  type ClientRecord, type ClientCategory,
} from "@/lib/clients";
import type { Booking } from "@/lib/types";

/** Client Master API — list (with FY stats), CSV template/export, manual
 *  save/delete, and the two-phase import: PREVIEW classifies every row
 *  (new / match / conflict / invalid) WITHOUT writing anything; COMMIT
 *  applies only the decisions the team confirmed. Conflicts are never
 *  auto-resolved — when in doubt, the row waits for a human. */

const CSV_HEADERS = ["name", "mobile", "email", "address", "city", "state", "pincode", "dob", "gstin", "category", "tags", "notes"] as const;

async function allBookings(): Promise<Booking[]> {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc");
  return (data ?? []).map((r) => r.doc as Booking);
}

const csvCell = (s: unknown) => {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const url = new URL(req.url);

  if (url.searchParams.get("template") === "1") {
    const body = CSV_HEADERS.join(",") + "\nAsha Mehta,+91 98XXX XXXXX,asha@example.com,12 MG Road,Ahmedabad,Gujarat,380001,1988-04-12,,,friends-referral,prefers morning pickups\n";
    return new NextResponse(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bagdrop-clients-template.csv" } });
  }

  const [records, bookings] = await Promise.all([loadClientRecords(), allBookings()]);
  const clients = deriveClients(records, bookings);

  if (url.searchParams.get("format") === "csv") {
    const rows = clients.map((c) => [
      c.name, c.mobile, c.email ?? "", c.address ?? "", c.city ?? "", c.state ?? "", c.pincode ?? "",
      c.dob ?? "", c.gstin ?? "", c.effectiveCategory, (c.tags ?? []).join("|"), c.notes ?? "",
      c.bookingCount, c.lifetimeValue,
      c.fyStats.map((s) => `${s.fy}:${s.bookings}b/₹${s.revenue}`).join(" "),
    ].map(csvCell).join(","));
    const body = [CSV_HEADERS.join(",") + ",bookings,lifetime_value,fy_breakdown", ...rows].join("\n") + "\n";
    return new NextResponse(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=bagdrop-clients-${new Date().toISOString().slice(0, 10)}.csv` } });
  }

  return NextResponse.json({ clients, categories: CLIENT_CATEGORIES });
}

interface ImportRow { name?: string; mobile?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string; dob?: string; gstin?: string; category?: string; tags?: string; notes?: string }
interface PreviewRow {
  n: number; status: "new" | "match" | "conflict" | "invalid";
  reason?: string;
  incoming?: ClientRecord;
  existing?: ClientRecord;
  diffs?: { field: string; existing: string; incoming: string }[];
}

function toRecord(r: ImportRow, n: number): { rec?: ClientRecord; error?: string } {
  const mobile = cleanMobile(r.mobile ?? "");
  if (!mobile) return { error: `Row ${n}: mobile "${r.mobile ?? ""}" is not a valid Indian number` };
  if (!r.name?.trim()) return { error: `Row ${n}: name is required` };
  const email = r.email?.trim() ? cleanEmail(r.email) : undefined;
  if (r.email?.trim() && !email) return { error: `Row ${n}: email "${r.email}" is invalid` };
  const dob = cleanDob(r.dob);
  if (dob === null) return { error: `Row ${n}: date of birth "${r.dob}" is invalid (use yyyy-mm-dd or dd/mm/yyyy)` };
  const category = r.category?.trim();
  if (category && !CLIENT_CATEGORIES.includes(category as ClientCategory)) return { error: `Row ${n}: category "${category}" is not one of ${CLIENT_CATEGORIES.join("/")}` };
  return {
    rec: {
      id: `CL-${mobile}`, name: r.name.trim(), mobile,
      email: email ?? undefined,
      address: r.address?.trim() || undefined, city: r.city?.trim() || undefined,
      state: r.state?.trim() || undefined, pincode: r.pincode?.trim() || undefined,
      dob: dob || undefined, gstin: r.gstin?.trim().toUpperCase() || undefined,
      category: (category as ClientCategory) || undefined,
      tags: r.tags?.trim() ? r.tags.split(/[|;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      notes: r.notes?.trim() || undefined,
      source: "import", createdAt: new Date().toISOString(),
    },
  };
}

const COMPARABLE: (keyof ClientRecord)[] = ["name", "email", "address", "city", "state", "pincode", "dob", "gstin"];

type Body =
  | { action: "save"; record: Partial<ClientRecord> & { name: string; mobile: string } }
  | { action: "delete"; id: string }
  | { action: "importPreview"; rows: ImportRow[] }
  | { action: "importCommit"; decisions: { mobile: string; choice: "create" | "skip" | "useUploaded" | "fillBlanks"; record: ClientRecord }[] };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const records = await loadClientRecords();

  if (b.action === "save") {
    const parsed = toRecord(b.record as ImportRow, 0);
    if (parsed.error) return NextResponse.json({ error: "INVALID", detail: parsed.error.replace("Row 0: ", "") }, { status: 400 });
    const rec = { ...parsed.rec!, source: b.record.source ?? "manual", createdAt: records.find((r) => r.mobile === parsed.rec!.mobile)?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    await saveClientRecords([...records.filter((r) => r.mobile !== rec.mobile), rec]);
    return NextResponse.json({ ok: true, record: rec });
  }

  if (b.action === "delete") {
    await saveClientRecords(records.filter((r) => r.id !== b.id));
    return NextResponse.json({ ok: true });
  }

  if (b.action === "importPreview") {
    const bookings = await allBookings();
    const existingViews = deriveClients(records, bookings);
    const byMobile = new Map(existingViews.map((c) => [c.mobile, c]));
    const seenInFile = new Set<string>();
    const preview: PreviewRow[] = [];
    (b.rows ?? []).slice(0, 2000).forEach((row, i) => {
      const n = i + 2; // header is row 1
      const parsed = toRecord(row, n);
      if (parsed.error) { preview.push({ n, status: "invalid", reason: parsed.error }); return; }
      const rec = parsed.rec!;
      if (seenInFile.has(rec.mobile)) { preview.push({ n, status: "invalid", reason: `Row ${n}: duplicate of mobile ${rec.mobile} earlier in this file — fix the file first` }); return; }
      seenInFile.add(rec.mobile);
      const existing = byMobile.get(rec.mobile);
      if (!existing) { preview.push({ n, status: "new", incoming: rec }); return; }
      const diffs = COMPARABLE
        .map((f) => ({ field: f, existing: String(existing[f] ?? ""), incoming: String(rec[f] ?? "") }))
        .filter((d) => d.incoming && d.existing && d.incoming.toLowerCase() !== d.existing.toLowerCase());
      const fills = COMPARABLE.filter((f) => !existing[f] && rec[f]).length;
      if (diffs.length) preview.push({ n, status: "conflict", incoming: rec, existing: { ...existing, id: existing.id } as ClientRecord, diffs });
      else preview.push({ n, status: "match", reason: fills ? `${fills} blank field(s) can be filled` : "identical — nothing to change", incoming: rec, existing: { ...existing } as ClientRecord });
    });
    return NextResponse.json({ preview, summary: { new: preview.filter((p) => p.status === "new").length, match: preview.filter((p) => p.status === "match").length, conflict: preview.filter((p) => p.status === "conflict").length, invalid: preview.filter((p) => p.status === "invalid").length } });
  }

  if (b.action === "importCommit") {
    let created = 0, merged = 0, skipped = 0;
    const next = [...records];
    /* booking-derived knowledge counts as "existing" too — fillBlanks must
     * never let an upload overwrite what the bookings already tell us */
    const derived = new Map(deriveClients(records, await allBookings()).map((c) => [c.mobile, c]));
    const baseOf = (mobile: string): ClientRecord | null => {
      const v = derived.get(mobile);
      if (!v) return null;
      return {
        id: `CL-${mobile}`, name: v.name, mobile,
        email: v.email, address: v.address, city: v.city, state: v.state,
        pincode: v.pincode, dob: v.dob, gstin: v.gstin, category: v.category,
        tags: v.tags, notes: v.notes, source: "booking", createdAt: v.createdAt,
      };
    };
    for (const d of b.decisions ?? []) {
      const mobile = cleanMobile(d.mobile);
      if (!mobile || !d.record) { skipped++; continue; }
      const incoming: ClientRecord = { ...d.record, mobile, id: `CL-${mobile}`, source: "import", updatedAt: new Date().toISOString() };
      const idx = next.findIndex((r) => r.mobile === mobile);
      if (d.choice === "skip") { skipped++; continue; }
      if (d.choice === "create") {
        if (idx >= 0 || derived.has(mobile)) { skipped++; continue; } // safety: "create" never overwrites anyone known
        next.push({ ...incoming, createdAt: new Date().toISOString() });
        created++;
      } else if (d.choice === "useUploaded") {
        if (idx >= 0) { next[idx] = { ...incoming, createdAt: next[idx].createdAt }; merged++; }
        else { next.push({ ...incoming, createdAt: new Date().toISOString() }); created++; }
      } else if (d.choice === "fillBlanks") {
        const cur = idx >= 0 ? next[idx] : baseOf(mobile);
        if (cur) {
          const fill: ClientRecord = { ...cur, updatedAt: new Date().toISOString() };
          for (const f of [...COMPARABLE, "pincode", "notes", "category"] as (keyof ClientRecord)[]) {
            if (!fill[f] && incoming[f]) (fill as unknown as Record<string, unknown>)[f] = incoming[f];
          }
          if (incoming.tags?.length) fill.tags = [...new Set([...(cur.tags ?? []), ...incoming.tags])];
          if (idx >= 0) next[idx] = fill; else next.push(fill);
          merged++;
        } else { next.push({ ...incoming, createdAt: new Date().toISOString() }); created++; }
      }
    }
    await saveClientRecords(next);
    return NextResponse.json({ ok: true, created, merged, skipped, total: next.length });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
