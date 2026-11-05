"use client";
/** Admin OS · Quotes & payments — the quote desk.
 *
 *  Right: the inquiry queue — every website booking request waiting on the
 *  team, every quote waiting on the customer, and bagdrop.co's new leads,
 *  oldest first, with how long each has waited (2-hour approval target).
 *  Left: the quote form. Opening a card loads it into the form so the team
 *  can correct any detail and then Accept, Send a revised price, Ask the
 *  customer, Hold, Reject or Save changes only. Every action goes through
 *  the one decision route (src/app/api/admin/decision), which re-prices,
 *  re-signs, messages the customer and logs who did it; "Save changes only"
 *  uses src/app/api/admin/inquiry and never moves the price. With no card
 *  open, the form makes a new quote for a phone / WhatsApp / walk-in /
 *  partner inquiry, as before (src/app/api/admin/quotes). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/useNow";
import { useOnChange, usePlanAutofill } from "@/lib/stateSync";
import { useLoad } from "@/lib/useLoad";
import { AIRPORTS, CITIES, inr } from "@/lib/pricing";
import { airportEnd, cityAirportCodes } from "@/lib/airports";
import AirportPicker from "@/components/booking/AirportPicker";
import { computeTravelPlan, isSlotFeasible, SLOTS } from "@/lib/travelPlan";
import { refreshBookings, watchAdminBookings } from "@/lib/adminApi";
import { deskLock } from "@/lib/deskRules";
import { isPaid } from "@/lib/payState";
import { pcsLabel } from "@/lib/opsModel";
import { estimateDisplayNo } from "@/lib/docs";
import DocumentView from "./DocumentView";
import type { Booking, DocRecord, Mode, UseCase } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const SERVICES: { uc: UseCase; mode: Mode; title: string }[] = [
  { uc: "d2a", mode: "air", title: "Home → Airport" },
  { uc: "a2d", mode: "air", title: "Airport → Home" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel" },
  { uc: "d2d", mode: "road", title: "Door → Door" },
  { uc: "rail", mode: "rail", title: "Railway station" },
  { uc: "cruise", mode: "sea", title: "Cruise terminal" },
];

interface Draft {
  title: string; name: string; mobile: string; email: string; res: "in" | "intl";
  uc: UseCase; mode: Mode; fromName: string; toName: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string; date: string; pickupDate: string; deliveryDate: string; flight: string; flightTime: string; slot: string;
  bags: number; oversize: number; note: string; staffNote: string;
}

const EMPTY: Draft = {
  title: "Mr.", name: "", mobile: "", email: "", res: "in",
  uc: "d2a", mode: "air", fromName: "Ahmedabad", toName: "Mumbai", fromOther: "", toOther: "",
  pickAddr: "", dropAddr: "", date: "", pickupDate: "", deliveryDate: "", flight: "", flightTime: "", slot: "",
  bags: 2, oversize: 0, note: "", staffNote: "",
};

type Editing =
  | { kind: "new" }
  | { kind: "booking"; id: string; rev: number; base: Draft }
  | { kind: "lead"; id: string; ref: string; base: Draft };

const resolved = (pick: string, other: string) => (pick === "other" ? other.trim() : pick);

function draftFromBooking(b: Booking, cityNames: string[]): Draft {
  const svc = SERVICES.find((s) => s.uc === b.uc);
  const known = (c: string) => cityNames.includes(c);
  return {
    title: b.traveller.title ?? "", name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email ?? "", res: b.traveller.res ?? "in",
    uc: svc?.uc ?? "d2d", mode: svc?.mode ?? b.mode,
    fromName: known(b.from) ? b.from : "other", fromOther: known(b.from) ? "" : b.from,
    toName: known(b.to) ? b.to : "other", toOther: known(b.to) ? "" : b.to,
    pickAddr: b.pickAddr, dropAddr: b.dropAddr, date: b.date, pickupDate: b.pickupDate ?? "", deliveryDate: b.deliveryDate ?? "",
    flight: b.ref, flightTime: b.flightTime ?? "", slot: b.slot, bags: b.bags, oversize: b.oversize, note: b.note,
    staffNote: (b.admin as { staffNote?: string }).staffNote ?? "",
  };
}

function draftFromLead(l: ProductionLead, cityNames: string[]): Draft {
  const city = (c: string | null) => cityNames.find((n) => n.toLowerCase() === (c ?? "").trim().toLowerCase());
  const f = city(l.fromCity), t = city(l.toCity);
  const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
  return {
    ...EMPTY, title: "", uc: "d2d", mode: "road",
    name: l.name, mobile: l.phone, email: l.email ?? "",
    fromName: f ?? "other", fromOther: f ? "" : l.fromCity ?? "", toName: t ?? "other", toOther: t ? "" : l.toCity ?? "",
    date: day(l.travelDate) || day(l.pickupDate), pickupDate: day(l.pickupDate), deliveryDate: day(l.deliveryDate),
    flight: l.flightNumber ?? "", bags: Math.max(0, Math.min(50, l.bagsCount ?? 1)),
    note: [l.serviceInterest ? `Asked for: ${l.serviceInterest}` : "", l.notes ?? ""].filter(Boolean).join(" · ").slice(0, 300),
  };
}

/** Field-by-field difference between what was loaded and what is on screen,
 *  in the shape the server takes (lib/inquiryEdit.ts InquiryChanges). */
const DIFF_FIELDS: { key: string; label: string; val: (d: Draft) => string | number }[] = [
  { key: "title", label: "Title", val: (d) => d.title },
  { key: "name", label: "Name", val: (d) => d.name.trim() },
  { key: "mobile", label: "Mobile", val: (d) => d.mobile.trim() },
  { key: "email", label: "Email", val: (d) => d.email.trim() },
  { key: "res", label: "Traveller", val: (d) => d.res },
  { key: "uc", label: "Service", val: (d) => d.uc },
  { key: "from", label: "Pickup city", val: (d) => resolved(d.fromName, d.fromOther) },
  { key: "to", label: "Delivery city", val: (d) => resolved(d.toName, d.toOther) },
  { key: "pickAddr", label: "Pickup address", val: (d) => d.pickAddr.trim() },
  { key: "dropAddr", label: "Delivery address", val: (d) => d.dropAddr.trim() },
  { key: "date", label: "Travel date", val: (d) => d.date },
  { key: "pickupDate", label: "Pickup date", val: (d) => d.pickupDate },
  { key: "deliveryDate", label: "Delivery date", val: (d) => d.deliveryDate },
  { key: "flightTime", label: "Flight time", val: (d) => d.flightTime },
  { key: "ref", label: "Flight / reference", val: (d) => d.flight.trim().toUpperCase() },
  { key: "slot", label: "Pickup time", val: (d) => d.slot },
  { key: "bags", label: "Bags", val: (d) => d.bags },
  { key: "oversize", label: "Oversize", val: (d) => d.oversize },
  { key: "note", label: "Customer note", val: (d) => d.note.trim() },
  { key: "staffNote", label: "Internal note", val: (d) => d.staffNote.trim() },
];
function diffOf(base: Draft, d: Draft) {
  const changes: Record<string, string | number> = {}, labels: string[] = [];
  for (const f of DIFF_FIELDS) {
    const a = f.val(base), b = f.val(d);
    if (a !== b) { changes[f.key] = b; labels.push(f.label); }
  }
  return { changes, labels };
}

/* ---------- queue ---------- */
type Group = "decide" | "waiting" | "lead";
interface QItem {
  key: string; kind: "booking" | "lead"; id: string; ref: string; name: string; route: string; pcs: string; day: string;
  group: Group; tag: string; tone: "ok" | "warn" | "bad" | "info" | "muted"; ror: boolean; since: string;
}
const FILTERS: { key: "all" | "decide" | "rate" | "waiting" | "lead"; name: string }[] = [
  { key: "all", name: "All" }, { key: "decide", name: "Needs decision" }, { key: "rate", name: "Needs a rate" },
  { key: "waiting", name: "Waiting on customer" }, { key: "lead", name: "bagdrop.co leads" },
];
const APPROVAL_TARGET_MS = 2 * 3600_000;
/* bagdrop.co leads that still need a quote: the lead is open and its bagdrop.co
 * booking (made automatically with every lead) has not been quoted yet — a lead
 * already quoted there is left alone, so a customer never gets two quotes */
const LEAD_OPEN = ["new", "contacted", "qualified"];
const LEAD_PRE_QUOTE = ["inquiry", "pending", "review", "document_collection"];
const leadNeedsQuote = (l: ProductionLead) => LEAD_OPEN.includes(l.status) && (!l.booking || LEAD_PRE_QUOTE.includes(l.booking.status ?? ""));

function queueItem(b: Booking): QItem | null {
  if (!["submitted", "revised", "quoted", "identified"].includes(b.status) || deskLock(b)) return null;
  const dec = (b.admin as { decision?: { state?: string; at?: string } }).decision;
  const ror = !!b.quote.breakdown?.ror;
  const decide = b.status === "submitted" && dec?.state !== "info" && dec?.state !== "hold";
  const tag = decide ? (ror ? "No price, needs a rate" : "Chart price")
    : dec?.state === "info" ? "Waiting for customer info"
    : dec?.state === "hold" ? "On hold"
    : b.status === "revised" ? "Revised, waiting on customer"
    : "Quote sent, waiting on customer";
  return {
    key: `b:${b.id}`, kind: "booking", id: b.id, ref: b.id, name: b.traveller.name || "No name",
    route: `${b.from} → ${b.to}`, pcs: pcsLabel(b.bags, b.oversize), day: b.pickupDate || b.date,
    group: decide ? "decide" : "waiting", tag, tone: decide ? (ror ? "bad" : "warn") : dec?.state === "hold" ? "muted" : "info",
    ror, since: decide ? b.created : dec?.at ?? b.created,
  };
}
function leadItem(l: ProductionLead): QItem {
  return {
    key: `l:${l.id}`, kind: "lead", id: l.id, ref: l.leadNumber ?? l.id.slice(0, 8), name: l.name || "No name",
    route: `${l.fromCity ?? "?"} → ${l.toCity ?? "?"}`, pcs: l.bagsCount != null ? `${l.bagsCount} bag${l.bagsCount === 1 ? "" : "s"}` : "bags not given",
    day: (l.pickupDate ?? l.travelDate ?? "").slice(0, 10), group: "lead", tag: "bagdrop.co lead", tone: "info", ror: false, since: l.createdAt,
  };
}
function waited(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} days`;
}

export default function QuotesAndPayments({ openId }: { openId?: string }) {
  const [all, setAll] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => watchAdminBookings((l) => { setAll(l); setLoaded(true); }, () => {}), []);

  const [leads, setLeads] = useState<ProductionLead[]>([]);
  const [leadsNote, setLeadsNote] = useState("");
  const loadLeads = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/production-leads?limit=1000");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLeadsNote(r.status === 503 ? "bagdrop.co leads aren't connected here." : "Couldn't load bagdrop.co leads."); return; }
      setLeads(j.leads as ProductionLead[]); setLeadsNote("");
    } catch { setLeadsNote("Couldn't load bagdrop.co leads."); }
  }, []);
  useLoad(loadLeads, 60000);

  /* the live location list from the pricing engine (falls back to the built-in one) */
  const [cityNames, setCityNames] = useState<string[]>(() => CITIES.map((c) => c.name));
  const [cityInfo, setCityInfo] = useState<{ name: string; ap: string | null; aps: string[] }[]>([]);
  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((j) => {
      if (Array.isArray(j.cities) && j.cities.length) { setCityNames(j.cities.map((c: { name: string }) => c.name)); setCityInfo(j.cities); }
    }).catch(() => {});
  }, []);

  const now = useNow();
  const today = now ? new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10) : "";

  /* ---- queue ---- */
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [shown, setShown] = useState(40);
  const items = useMemo(() => {
    const linked = new Set(all.map((b) => (b.admin as { prodLeadId?: string }).prodLeadId).filter(Boolean));
    const list = [
      ...all.map(queueItem).filter((x): x is QItem => !!x),
      ...leads.filter((l) => leadNeedsQuote(l) && !linked.has(l.id)).map(leadItem),
    ];
    return list.sort((a, b) => a.since.localeCompare(b.since));
  }, [all, leads]);
  const counts = useMemo(() => ({
    all: items.length, decide: items.filter((i) => i.group === "decide").length, rate: items.filter((i) => i.group === "decide" && i.ror).length,
    waiting: items.filter((i) => i.group === "waiting").length, lead: items.filter((i) => i.group === "lead").length,
  }), [items]);
  const visible = items.filter((i) => filter === "all" || (filter === "rate" ? i.group === "decide" && i.ror : i.group === filter));
  useOnChange(filter, () => setShown(40));

  /* ---- the form ---- */
  const [editing, setEditing] = useState<Editing>({ kind: "new" });
  const [d, setD] = useState<Draft>(EMPTY);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const [teamPrice, setTeamPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; stale?: boolean } | null>(null);
  const [done, setDone] = useState("");
  const [saved, setSaved] = useState<Booking | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocRecord | null>(null);

  const booking = editing.kind === "booking" ? all.find((b) => b.id === editing.id) ?? null : null;
  const estimateDoc = booking?.docs?.filter((d) => d.type === "PI").slice(-1)[0] ?? null;
  /* a paid booking that hasn't moved yet may still be changed: the chart
   * re-prices it and the difference becomes a top-up or a credit note */
  const amendable = !!booking && isPaid(booking) && ["accepted", "assigned"].includes(booking.status);
  const lock = booking ? (amendable ? null : deskLock(booking)) : null;
  const [amendReason, setAmendReason] = useState("");
  const [amended, setAmended] = useState<{ delta: number; creditNote: string | null; changed: string[] } | null>(null);
  async function amend() {
    if (editing.kind !== "booking") return;
    const j = await call("/api/admin/quotes/amend", "POST", { id: editing.id, changes: diff.changes, reason: amendReason.trim() });
    if (!j) return;
    setAmended({ delta: j.delta, creditNote: j.creditNote, changed: j.changed });
    setDone(j.delta > 0 ? `changed · top-up ${inr(j.delta)} due, client told` : j.delta < 0 ? `changed · credit note ${j.creditNote} for ${inr(-j.delta)} issued, client told` : "changed · same price, client told");
    setAmendReason("");
    refreshBookings();
  }

  function openBooking(b: Booking) {
    const base = draftFromBooking(b, cityNames);
    setEditing({ kind: "booking", id: b.id, rev: b.rev ?? 0, base }); setD(base);
    setTeamPrice(""); setMessage(""); setErr(null); setDone(""); setSaved(null);
  }
  function openLead(l: ProductionLead) {
    const base = draftFromLead(l, cityNames);
    setEditing({ kind: "lead", id: l.id, ref: l.leadNumber ?? l.id.slice(0, 8), base }); setD(base);
    setTeamPrice(""); setMessage(""); setErr(null); setDone(""); setSaved(null);
  }
  function startNew() {
    setEditing({ kind: "new" }); setD(EMPTY); setTeamPrice(""); setMessage(""); setErr(null); setSaved(null);
  }
  /* a booking the Shipments inbox sent here ("Open in quote desk") */
  const sent = openId ? all.find((b) => b.id === openId) : undefined;
  useOnChange(`${openId ?? ""}|${sent ? "found" : ""}`, () => { if (sent) openBooking(sent); });

  const fromName = resolved(d.fromName, d.fromOther);
  const toName = resolved(d.toName, d.toOther);

  /* chart price for what is on screen, from the server's live rate chart */
  const [chart, setChart] = useState<{ key: string; total: number | null } | null>(null);
  const chartKey = `${fromName}|${toName}|${d.bags}|${d.oversize}|${d.mode}`;
  useEffect(() => {
    if (!fromName || !toName || d.fromName === "other" || d.toName === "other") return;
    const t = setTimeout(() => {
      fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode }) })
        .then((r) => r.json()).then((j) => setChart({ key: chartKey, total: typeof j.total === "number" ? j.total : null })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [chartKey, fromName, toName, d.bags, d.oversize, d.mode, d.fromName, d.toName]);
  const otherCity = d.fromName === "other" || d.toName === "other";
  const chartTotal = otherCity ? null : chart?.key === chartKey ? chart.total : undefined; // undefined = still checking

  const plan = useMemo(() => computeTravelPlan(d.mode, d.uc === "a2d", d.date, d.flightTime), [d.mode, d.uc, d.date, d.flightTime]);
  usePlanAutofill(plan, d, setD);

  const diff = editing.kind === "booking" ? diffOf(editing.base, d) : { changes: {}, labels: [] as string[] };
  const team = Math.round(Number(teamPrice) || 0);
  const priceInputsMoved = diff.labels.some((l) => ["Pickup city", "Delivery city", "Bags", "Oversize"].includes(l));
  /* the price Accept charges: the team price; else the booking's own price while
   * it holds (unchanged lane and bags, not expired); else today's chart */
  const holds = !!booking && !priceInputsMoved && !booking.quote.breakdown?.ror && booking.quote.total > 0
    && (booking.quote.breakdown?.rule === "team price (manual)" || !booking.quote.validUntil || (!!now && Date.parse(booking.quote.validUntil) >= now));
  const acceptPrice = team > 0 ? team : holds ? booking!.quote.total : chartTotal ?? null;

  async function call(url: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true); setErr(null); setDone("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr({ text: j.detail ?? j.error ?? `Request failed (${r.status})`, stale: j.error === "STALE" }); return null; }
      return j;
    } catch { setErr({ text: "Couldn't reach the server — check the connection and try again." }); return null; }
    finally { setBusy(false); }
  }

  const ACTION_DONE: Record<string, string> = {
    approve: "accepted · payment link sent to the customer", revise: "revised price sent to the customer",
    info: "question sent to the customer", hold: "put on hold · the customer was told why", reject: "rejected · the customer was told why",
  };
  async function decide(decision: "approve" | "revise" | "info" | "hold" | "reject") {
    if (editing.kind !== "booking") return;
    /* approve sends the amount only when the server would not arrive at it by
     * itself: a team price, or a chart price for an inquiry saved without one */
    const total = decision === "revise" ? (team > 0 ? team : chartTotal ?? 0)
      : decision === "approve" ? (team > 0 ? team : !holds && !priceInputsMoved && booking?.quote.breakdown?.ror && chartTotal ? chartTotal : undefined)
      : undefined;
    const j = await call("/api/admin/decision", "POST", { id: editing.id, rev: editing.rev, decision, note: message.trim(), total, changes: diff.changes });
    if (!j) return;
    refreshBookings();
    setDone(`${editing.id} ${ACTION_DONE[decision]}${diff.labels.length ? ` · corrected: ${diff.labels.join(", ")}` : ""}.`);
    startNew();
  }
  async function saveOnly() {
    if (editing.kind !== "booking") return;
    const j = await call("/api/admin/inquiry", "PATCH", { id: editing.id, rev: editing.rev, changes: diff.changes });
    if (!j) return;
    refreshBookings();
    const b = j.booking as Booking;
    const base = draftFromBooking(b, cityNames);
    setEditing({ kind: "booking", id: b.id, rev: b.rev ?? 0, base }); setD(base);
    setDone(`${b.id} saved · ${(j.changed as string[]).length ? (j.changed as string[]).join("; ") : "nothing had changed"}. The customer was not messaged.`);
  }
  function reloadLatest() {
    if (editing.kind !== "booking") return;
    refreshBookings();
    const b = all.find((x) => x.id === editing.id);
    if (b) openBooking(b);
  }
  async function saveNew() {
    const svc = SERVICES.find((s) => s.uc === d.uc);
    const j = await call("/api/admin/quotes", "POST", {
      title: d.title, name: d.name, mobile: d.mobile, email: d.email || undefined, res: d.res,
      fromName, toName, pickAddr: d.pickAddr, dropAddr: d.dropAddr,
      uc: d.uc, ucName: svc?.title, mode: d.mode, date: d.date, flight: d.flight,
      pickupDate: d.pickupDate || d.date, deliveryDate: d.deliveryDate || undefined, flightTime: d.flightTime || undefined, slot: d.slot,
      bags: d.bags, oversize: d.oversize, note: d.note,
      ...(editing.kind === "lead" ? { source: `bagdrop.co lead ${editing.ref}`, prodLeadId: editing.id } : {}),
    });
    if (!j) return;
    refreshBookings();
    setSaved(j.booking as Booking);
    setEditing({ kind: "new" }); setD(EMPTY);
  }

  const link = saved ? `${typeof window !== "undefined" ? window.location.origin : ""}/q/${saved.id}` : "";
  const waText = saved
    ? `Hi ${saved.traveller.name.split(" ")[0]}, here's your Bagdrop quote for ${saved.from} → ${saved.to}: ${saved.quote.breakdown?.ror ? "our team will confirm the rate shortly" : `${inr(saved.quote.total)}, locked for 24h`}.\nPay securely here: ${link}`
    : "";

  const airportCodes = (city: string) => cityAirportCodes(cityInfo.find((c) => c.name === city) ?? CITIES.find((c) => c.name === city));
  const isBooking = editing.kind === "booking";
  const needsMsg = !message.trim();

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid content-start gap-5">
        {done && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">{done}</p>}
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold">
              {editing.kind === "booking" ? <>Inquiry {editing.id}</> : editing.kind === "lead" ? <>bagdrop.co lead {editing.ref} <span className="font-normal text-faint">· becomes a quote when saved</span></> : <>New quote <span className="font-normal text-faint">for phone, WhatsApp, walk-in or partner inquiries</span></>}
            </h3>
            <div className="flex items-center gap-2">
              {booking && <Badge tone={booking.status === "submitted" ? "warn" : "info"}>{booking.status === "submitted" ? "needs decision" : booking.status === "accepted" ? "accepted, unpaid" : booking.status}</Badge>}
              {editing.kind !== "new" && <Button size="sm" variant="outline" onClick={startNew}>Start a new quote</Button>}
            </div>
          </div>
          {isBooking && !booking && loaded && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This booking is no longer in the list. Start a new quote or pick another inquiry.</p>}
          {lock && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{lock}</p>}

          <fieldset disabled={!!lock || busy} className="m-0 border-0 p-0">
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Title">
                <Select value={d.title} onChange={(e) => set("title", e.target.value)}>
                  {["", "Mr.", "Ms.", "Mrs.", "Dr.", "M/s"].map((t) => <option key={t} value={t}>{t || "None"}</option>)}
                </Select>
              </Field>
              <Field label="Customer name"><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" /></Field>
              <Field label="Mobile"><Input value={d.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 …" /></Field>
              <Field label="Email (optional)"><Input value={d.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
              <Field label="Traveller is">
                <Select value={d.res} onChange={(e) => set("res", e.target.value as Draft["res"])}>
                  <option value="in">Indian resident · Aadhaar</option>
                  <option value="intl">International · passport</option>
                </Select>
              </Field>
              <Field label="Service">
                <Select value={d.uc} onChange={(e) => {
                  const svc = SERVICES.find((s) => s.uc === e.target.value);
                  set("uc", e.target.value as UseCase); if (svc) set("mode", svc.mode);
                  if (airportEnd(e.target.value) !== airportEnd(d.uc)) setD((p) => ({ ...p, pickAddr: "", dropAddr: "" }));
                }}>
                  {SERVICES.map((s) => <option key={s.uc} value={s.uc}>{s.title}</option>)}
                </Select>
              </Field>
              <Field label="Pickup city">
                <Select value={d.fromName} onChange={(e) => set("fromName", e.target.value)}>
                  {cityNames.map((c) => <option key={c}>{c}</option>)}
                  <option value="other">Others · type the city</option>
                </Select>
              </Field>
              <Field label="Delivery city">
                <Select value={d.toName} onChange={(e) => set("toName", e.target.value)}>
                  {cityNames.map((c) => <option key={c}>{c}</option>)}
                  <option value="other">Others · type the city</option>
                </Select>
              </Field>
              {d.fromName === "other" && <Field label="Pickup city (typed)"><Input value={d.fromOther} onChange={(e) => set("fromOther", e.target.value)} placeholder="Type the city" /></Field>}
              {d.toName === "other" && <Field label="Delivery city (typed)"><Input value={d.toOther} onChange={(e) => set("toOther", e.target.value)} placeholder="Type the city" /></Field>}
              {(() => {
                /* the airport end of an air service: the airport(s) serving that city, filled into the address */
                const end = airportEnd(d.uc), city = end === "from" ? d.fromName : end === "to" ? d.toName : "";
                const codes = airportCodes(city);
                const base = editing.kind === "booking" ? editing.base : null;
                const keep = (which: "from" | "to") => base && base.uc === d.uc && (which === "from" ? base.fromName === d.fromName : base.toName === d.toName) ? (which === "from" ? base.pickAddr : base.dropAddr) : undefined;
                return (<>
                  {end === "from" && codes.length ? <AirportPicker key={`${editing.kind}|${d.uc}|${city}`} label="Pickup airport" city={city} codes={codes} airports={AIRPORTS} initial={keep("from")} onAddress={(a) => set("pickAddr", a)} />
                    : <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} /></Field>}
                  {end === "to" && codes.length ? <AirportPicker key={`${editing.kind}|${d.uc}|${city}`} label="Delivery airport" city={city} codes={codes} airports={AIRPORTS} initial={keep("to")} onAddress={(a) => set("dropAddr", a)} />
                    : <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} /></Field>}
                </>);
              })()}
              <Field label="Travel date"><Input type="date" value={d.date} min={isBooking ? undefined : today} onChange={(e) => set("date", e.target.value)} /></Field>
              <Field label="Delivery date (optional)"><Input type="date" value={d.deliveryDate} min={d.date || today} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
              <Field label="Flight / reference (optional)"><Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" /></Field>
              {plan.usesFlightTime && (
                <Field label={d.uc === "a2d" ? (d.mode === "air" ? "Flight arrival time" : "Arrival time") : d.mode === "air" ? "Flight departure time" : d.mode === "rail" ? "Train departure time" : "Sailing time"}>
                  <Input type="time" value={d.flightTime} onChange={(e) => set("flightTime", e.target.value)} />
                </Field>
              )}
              <Field label={`Pickup time${plan.usesFlightTime && d.uc !== "a2d" && d.pickupDate && d.pickupDate !== d.date ? ` · on ${d.pickupDate} (evening before)` : ""}`}>
                <Select value={d.slot} onChange={(e) => set("slot", e.target.value)}>
                  <option value="">Select time</option>
                  {d.slot && !SLOTS.some((s) => s.label === d.slot) && <option value={d.slot}>{d.slot}</option>}
                  {SLOTS.filter((s) => s.label === d.slot || isSlotFeasible(s.label, plan, d.pickupDate || d.date)).map((s) => (
                    <option key={s.label} value={s.label}>{s.label}{s.label === plan.suggestedSlot ? " · suggested" : ""}</option>
                  ))}
                </Select>
              </Field>
              {plan.usesFlightTime && <p className="mb-2 text-xs text-muted sm:col-span-2">{plan.cutoffNote}</p>}
              <Field label="Bags"><Input type="number" min={0} max={50} value={d.bags} onChange={(e) => set("bags", Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></Field>
              <Field label="Oversize"><Input type="number" min={0} max={20} value={d.oversize} onChange={(e) => set("oversize", Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></Field>
              <Field label="Customer note (optional)"><Input value={d.note} onChange={(e) => set("note", e.target.value)} /></Field>
              {isBooking && <Field label="Internal note (team only, never shown to the customer)"><Input value={d.staffNote} onChange={(e) => set("staffNote", e.target.value)} /></Field>}
            </div>

            {/* price */}
            <div className="mb-4 grid gap-1 rounded-xl bg-paper p-3 text-sm">
              {booking && (
                <span>Price now: <b>{booking.quote.breakdown?.ror ? "rate on request" : inr(booking.quote.total)}</b>
                  <span className="text-muted"> · {booking.quote.breakdown?.ror ? "lane not on the rate chart" : booking.quote.breakdown?.rule === "team price (manual)" ? "team price" : "rate chart"}{booking.quote.validUntil ? ` · held until ${new Date(booking.quote.validUntil).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span></span>
              )}
              <span>{booking ? "Rate chart for the details on screen: " : ""}
                {chartTotal === undefined ? <span className="text-muted">checking the rate chart…</span>
                  : chartTotal === null ? <span className="text-muted">rate on request · this lane isn&apos;t on the chart{isBooking ? " — enter a team price to accept" : "; the quote saves marked rate-on-request"}</span>
                  : <><b>{inr(chartTotal)}</b> <span className="text-muted">· GST 5% included</span></>}
              </span>
              {isBooking && (
                <div className="mt-1 max-w-xs">
                  <Field label="Team price (₹, GST included) — optional; overrides the chart">
                    <Input inputMode="numeric" value={teamPrice} onChange={(e) => setTeamPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder={chartTotal ? String(chartTotal) : "Required for a lane not on the chart"} />
                  </Field>
                </div>
              )}
            </div>

            {booking && estimateDoc && (
              <div className="mb-4 rounded-xl border border-[#EA580C]/30 bg-orange-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Estimate <b className="font-mono">{estimateDisplayNo(estimateDoc.no)}</b> — ready to send to the customer.</span>
                  <Button size="sm" variant="outline" onClick={() => setViewingDoc(estimateDoc)}>View / print</Button>
                </div>
                {!amendable && (
                  <p className="mt-2 text-xs text-stone-600">
                    <b>Found a mistake?</b> Edit any field above (or set a Team price) and click &quot;Accept&quot; again — the same Estimate number is corrected in place and the change is logged on the booking.
                  </p>
                )}
              </div>
            )}

            {isBooking && booking && amendable && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p><b>Paid booking.</b> Change any detail above; the rate chart re-prices it. Price up: a top-up falls due and the client gets the link. Price down: a credit note is issued. The client is told either way.</p>
                {diff.labels.length > 0 && <p className="mt-1 text-xs">Changed on screen: <b>{diff.labels.join(", ")}</b>{chartTotal != null && chartTotal !== booking.quote.total ? <> · new chart price <b>{inr(chartTotal)}</b> ({chartTotal > booking.quote.total ? `${inr(chartTotal - booking.quote.total)} more` : `${inr(booking.quote.total - chartTotal)} less`})</> : null}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input className="flex-1 py-1.5 text-xs" placeholder="Why is it changing? (logged, required)" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />
                  <Button size="sm" disabled={busy || !diff.labels.length || amendReason.trim().length < 5} onClick={() => void amend()}>Apply change after payment</Button>
                </div>
                {amended && <p className="mt-2 text-xs">{amended.delta > 0 ? `Top-up of ${inr(amended.delta)} is due.` : amended.delta < 0 ? `Credit note ${amended.creditNote} for ${inr(-amended.delta)} issued.` : "Price unchanged."} {amended.changed.join("; ")}</p>}
              </div>
            )}
            {isBooking && booking && !lock && !amendable && (
              <>
                {diff.labels.length > 0 && <p className="mb-2 text-xs text-muted">Changed on screen: <b className="text-ink">{diff.labels.join(", ")}</b></p>}
                <Field label="Message to the customer (needed to ask, hold or reject; optional otherwise)">
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Pickup window confirmed for 10 am to 12 noon" />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={acceptPrice == null || acceptPrice <= 0} onClick={() => void decide("approve")}>
                    {acceptPrice ? `Accept at ${inr(acceptPrice)} and send payment link` : "Accept and send payment link"}
                  </Button>
                  <Button variant="outline" disabled={!(team > 0 || (chartTotal ?? 0) > 0)} onClick={() => void decide("revise")}>
                    Send revised price{team > 0 ? ` ${inr(team)}` : chartTotal ? ` ${inr(chartTotal)}` : ""}
                  </Button>
                  <Button variant="outline" disabled={needsMsg} onClick={() => void decide("info")}>Ask the customer</Button>
                  <Button variant="outline" disabled={needsMsg} onClick={() => void decide("hold")}>Hold</Button>
                  <Button variant="outline" disabled={needsMsg} onClick={() => void decide("reject")}>Reject</Button>
                  <Button variant="ghost" disabled={!diff.labels.length} onClick={() => void saveOnly()}>Save changes only</Button>
                </div>
                <p className="mt-2 text-xs text-muted">Accept and Send revised price message the customer with the price. Save changes only never messages the customer and never changes the price.</p>
              </>
            )}
            {!isBooking && (
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!d.name.trim() || !d.mobile.trim() || !fromName || !toName} onClick={() => void saveNew()}>
                  {busy ? "Saving…" : "Save quote and get the payment link"}
                </Button>
              </div>
            )}
          </fieldset>
          {err && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
              <span>{err.text}</span>
              {err.stale && <Button size="sm" variant="outline" onClick={reloadLatest}>Load the latest copy</Button>}
            </div>
          )}
        </Card>

        {saved && (
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Share with the customer</h3>
            <p className="mb-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">Quote {saved.quote.qid ?? saved.id} saved · {saved.quote.breakdown?.ror ? "rate on request — open it from the queue to set a team price" : inr(saved.quote.total)}</p>
            <div className="mb-2 break-all rounded-lg bg-paper p-2 font-mono text-xs">{link}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>Copy payment link</Button>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(waText)}>Copy WhatsApp message</Button>
              <Button size="sm" variant="outline" onClick={() => window.open(link, "_blank")}>Open as the customer</Button>
            </div>
          </Card>
        )}
      </div>

      {/* the inquiry queue */}
      <Card className="self-start">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-bold">Inquiries <span className="font-normal text-faint">· oldest first</span></h3>
          <span className="text-xs text-muted">{counts.decide} need a decision</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${filter === f.key ? "text-white" : "hover:opacity-80"}`}
              style={filter === f.key ? { background: "var(--a-navy)" } : { background: "var(--a-surface-2)", color: "var(--a-muted)" }}>
              {f.name} {counts[f.key]}
            </button>
          ))}
        </div>
        {leadsNote && filter !== "decide" && filter !== "rate" && filter !== "waiting" && <p className="mb-2 text-xs text-muted">{leadsNote}</p>}
        {!loaded ? <p className="text-sm text-muted">Loading inquiries…</p>
          : visible.length === 0 ? <p className="text-sm text-muted">Nothing here right now.</p>
          : (
            <div className="grid gap-2">
              {visible.slice(0, shown).map((i) => {
                const open = (editing.kind === "booking" || editing.kind === "lead") && editing.id === i.id;
                const age = now ? now - Date.parse(i.since) : 0;
                const late = i.group === "decide" && age > APPROVAL_TARGET_MS;
                return (
                  <button key={i.key} onClick={() => {
                    if (i.kind === "booking") { const b = all.find((x) => x.id === i.id); if (b) openBooking(b); }
                    else { const l = leads.find((x) => x.id === i.id); if (l) openLead(l); }
                  }}
                    className={`cursor-pointer rounded-xl border p-2.5 text-left text-[13px] transition-colors ${open ? "border-brand bg-paper" : "border-line hover:bg-paper"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate">{i.name}</b>
                      <Badge tone={i.tone}>{i.tag}</Badge>
                    </div>
                    <div className="mt-0.5 text-muted">{i.route} · {i.pcs}{i.day ? ` · ${i.day}` : ""}</div>
                    <div className="mt-0.5 flex justify-between font-mono text-[11px] text-faint">
                      <span>{i.ref}</span>
                      <span className={late ? "font-semibold text-red-700" : ""}>{now ? `waiting ${waited(age)}${late ? " · over 2 h" : ""}` : ""}</span>
                    </div>
                  </button>
                );
              })}
              {visible.length > shown && <Button size="sm" variant="outline" onClick={() => setShown((n) => n + 40)}>Show more ({visible.length - shown} left)</Button>}
            </div>
          )}
      </Card>
      {viewingDoc && booking && <DocumentView booking={booking} doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </div>
  );
}
