"use client";
/** BAGDROP OS · Operations · bag tags, seals, stickers and the Move Pass
 *  for one shipment (airline-grade system: src/lib/bagTags.ts).
 *   · Issue licence plates + security seals for every piece (atomic per-hub
 *     serials; re-issuing only fills pieces that have none)
 *   · Per bag: plate (XL), seal, weight / HEAVY, pickup photo, and the
 *     FRAGILE / PRIORITY / THIS WAY UP stickers
 *   · Print: loop tags (loop stock or 4×6), backup labels, stickers, seals
 *     (VOID stock), everything on A4 sheets, or Zebra ZPL
 *   · The customer's Move Pass: open, copy, send on WhatsApp */
import { useCallback, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { refreshBookings } from "@/lib/adminApi";
import { HEAVY_KG, spaced, stickersOf, type UserSticker } from "@/lib/bagTags";
import { opsOf, pcsLabel } from "@/lib/opsModel";
import type { Booking } from "@/lib/types";
import { Badge, Button } from "@/components/ui";

const USER_STICKERS: { k: UserSticker; label: string }[] = [{ k: "FRAGILE", label: "Fragile" }, { k: "PRIORITY", label: "Priority" }, { k: "UP", label: "This way up" }];
const PRINTS: { label: string; kind: string; media: string; zpl?: boolean; hint: string }[] = [
  { label: "Loop tags · loop stock", kind: "loop", media: "loopstock", hint: "54 × 457 mm airline loop-tag stock" },
  { label: "Loop tags · 4×6", kind: "loop", media: "4x6", hint: "folds through the handle" },
  { label: "Backup labels", kind: "backup", media: "4x6", hint: "stick on the bag body" },
  { label: "Stickers", kind: "stickers", media: "4x6", hint: "XL / HEAVY / Fragile / Priority / Up" },
  { label: "Security seals", kind: "seals", media: "4x6", hint: "print on VOID tamper-evident stock" },
  { label: "Everything · A4", kind: "all", media: "a4", hint: "office printer, 8-up label sheets" },
  { label: "Brother QL-800 · 62×100", kind: "all", media: "ql62x100", hint: "DK-11202 die-cut labels" },
  { label: "Brother QL-800 · 62 mm roll", kind: "all", media: "ql62", hint: "DK-22205 continuous tape" },
  { label: "ZPL · 4×6", kind: "all", media: "4x6", zpl: true, hint: "Zebra thermal" },
  { label: "ZPL · loop stock", kind: "loop", media: "loopstock", zpl: true, hint: "Zebra loop-tag printer" },
];
const wa = (m: string | undefined, t: string) => `https://wa.me/${(m ?? "").replace(/\D/g, "").replace(/^(?!91)/, "91")}?text=${encodeURIComponent(t)}`;

interface Info { passUrl: string | null; photos: Record<string, string | null>; signature: string | null }

export default function BagTagsPanel({ b }: { b: Booking }) {
  const o = opsOf(b);
  const bags = o.bags ?? [];
  const pieces = b.bags + b.oversize;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const confirmed = (b.pay?.status === "captured" || !!b.payer) && ["accepted", "assigned", "picked_up", "in_transit", "delivered"].includes(b.status);

  const loadInfo = useCallback(async () => {
    const r = await fetch(`/api/admin/tags?id=${encodeURIComponent(b.id)}&info=1`, { cache: "no-store" });
    if (r.ok) setInfo(await r.json());
  }, [b.id]);
  useLoad(loadInfo);

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      setMsg({ ok: true, text: typeof j.issued === "number" ? (j.issued ? `${j.issued} tag(s) + seal(s) issued — print them below.` : "Every piece already has its tag.") : okText });
      refreshBookings(); void loadInfo();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  const printUrl = (p: (typeof PRINTS)[number]) => `/api/admin/tags?id=${encodeURIComponent(b.id)}&kind=${p.kind}&media=${p.media}${p.zpl ? "&format=zpl" : "&print=1"}`;
  const passAbs = info?.passUrl && typeof window !== "undefined" ? window.location.origin + info.passUrl : null;

  return (
    <div className="grid gap-2.5 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-[13px] font-bold">Bag tags &amp; seals <span className="font-normal text-faint">{bags.length}/{pieces} · {pcsLabel(b.bags, b.oversize)}</span></h4>
        {confirmed && bags.length < pieces && <Button size="sm" disabled={busy} onClick={() => void post({ action: "issue" }, "")}>Issue {pieces - bags.length} tag(s) + seal(s)</Button>}
      </div>
      {!confirmed && <p className="text-xs text-muted">Tags are issued once the booking is approved and paid.</p>}

      {bags.length > 0 && (
        <ul className="grid gap-1">
          {bags.map((x) => {
            const st = stickersOf(x);
            return (
              <li key={x.n} className="rounded-lg border border-line px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono font-semibold">{x.n} · {spaced(x.plate)}</span>
                  <span className="flex flex-wrap gap-1">
                    {st.includes("XL") && <Badge tone="warn">XL</Badge>}
                    {st.includes("HEAVY") && <Badge tone="bad">HEAVY</Badge>}
                    {x.checkedInAt ? <Badge tone="ok">checked in · {x.weightKg} kg</Badge> : <Badge tone="muted">not checked in</Badge>}
                    {info?.photos?.[x.n] && <a href={info.photos[x.n]!} target="_blank" rel="noreferrer" className="font-semibold text-brand">photo</a>}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted">
                  <span className="font-mono">seal {x.seal ? spaced(x.seal) : "—"}</span>
                  <span className="text-faint">·</span>
                  {USER_STICKERS.map((s) => {
                    const on = (x.stickers ?? []).includes(s.k);
                    return (
                      <button key={s.k} disabled={busy} onClick={() => void post({ action: "stickers", n: x.n, stickers: on ? (x.stickers ?? []).filter((k) => k !== s.k) : [...(x.stickers ?? []), s.k] }, `Piece ${x.n}: ${on ? "removed" : "added"} ${s.label}.`)}
                        className={`cursor-pointer rounded-full border px-2 py-px text-[10.5px] font-semibold ${on ? "border-ink bg-ink text-white" : "border-line hover:bg-paper"}`}>{s.label}</button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {bags.some((x) => (x.weightKg ?? 0) > HEAVY_KG) && <p className="text-[11px] text-red-700">A bag is over {HEAVY_KG} kg — its HEAVY sticker prints with the stickers.</p>}
      {o.checkin && <p className="text-[11px] text-muted">Checked in by {o.checkin.by} · {new Date(o.checkin.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{info?.signature && <> · <a href={info.signature} target="_blank" rel="noreferrer" className="font-semibold text-brand">customer signature</a></>}</p>}

      {bags.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {PRINTS.map((p) => (
            <a key={p.label} href={printUrl(p)} target="_blank" rel="noreferrer" title={p.hint}
              className="rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold hover:bg-paper">{p.label}<span className="block font-normal text-faint">{p.hint}</span></a>
          ))}
        </div>
      )}

      {info?.passUrl && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-line pt-2 text-xs">
          <span className="font-semibold">Move Pass</span>
          <a href={info.passUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Open</Button></a>
          <Button size="sm" variant="outline" onClick={() => passAbs && navigator.clipboard?.writeText(passAbs).then(() => setMsg({ ok: true, text: "Move Pass link copied." }))}>Copy link</Button>
          {passAbs && <a href={wa(b.traveller.mobile, `Hi ${b.traveller.name.split(" ")[0]}, your Bagdrop Move Pass for ${b.id} (${b.from} → ${b.to}) — show it at pickup and delivery: ${passAbs}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">WhatsApp</Button></a>}
        </div>
      )}
      {msg && <p className={`rounded-lg p-2 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
    </div>
  );
}
