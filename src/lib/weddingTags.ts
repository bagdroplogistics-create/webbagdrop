/** Printable wedding bag tags — one tag for every bag booked on a wedding
 *  desk (#Y2K), styled like an airline bag tag / boarding pass: Bagdrop mark
 *  and wordmark in a black band, the destination code in large type, a
 *  DELIVER TO bar with the room, pass-style fields, handling boxes, a Code 128
 *  and a QR of the tag code, and a tear-off guest claim stub. Black only, so
 *  thermal printers print it crisp; no icons (the logo is the only mark).
 *  Server-only (bwip-js). Media follow the bag-tag printer set: 4×6 thermal,
 *  Brother QL-800 62×100 die-cut, and A4 (4 tags per sheet, cut lines). */
import { code128, qr } from "./barcodes";
import { COMPANY } from "./company";
import type { Booking } from "./types";
import { weddingTags, type WeddingTag } from "./weddingTagData";

export { weddingTags, type WeddingTag };

export type WeddingTagMedia = "4x6" | "ql62x100" | "a4";
export const WEDDING_TAG_MEDIA: WeddingTagMedia[] = ["4x6", "ql62x100", "a4"];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type TagEvent = { hashtag: string; names: string; venue: string; venueCity?: string };

/* airport-style city codes for the routing block; anything else uses its first three letters */
const CITY_CODE: Record<string, string> = {
  mumbai: "BOM", thane: "BOM", "navi mumbai": "BOM", udaipur: "UDR", delhi: "DEL", "new delhi": "DEL", gurugram: "DEL", noida: "DEL",
  bengaluru: "BLR", bangalore: "BLR", ahmedabad: "AMD", vadodara: "BDQ", pune: "PNQ", jaipur: "JAI", hyderabad: "HYD",
  chennai: "MAA", kolkata: "CCU", surat: "STV", goa: "GOI", indore: "IDR", lucknow: "LKO", chandigarh: "IXC",
};
export const cityCode = (city?: string) => {
  const c = (city ?? "").trim().toLowerCase();
  return CITY_CODE[c] ?? (c.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "---");
};

/* the Bagdrop mark (suitcase B) as vector, so it prints sharp on any printer */
const MARK = (fg: string, bg: string) => `<svg class="mark" viewBox="0 0 30 40" aria-label="Bagdrop"><rect x="10" y="1.2" width="10" height="6.6" rx="2" fill="none" stroke="${fg}" stroke-width="2.4"/><path d="M4 7h12c6 0 10 4 10 9 0 2.6-1.2 4.7-3 6 2.6 1.4 4 3.8 4 6.8C27 34 23 38 17 38H4z" fill="${fg}"/><path d="M11 18l7 5-7 5z" fill="${bg}"/></svg>`;

const short = (d: string) => d.replace(/\s*·\s*/g, " · ").toUpperCase();

/** One airline-style tag: header band, routing, deliver-to bar, pass fields, handling, barcode, claim stub. */
function tagHtml(t: WeddingTag, ev: TagEvent): string {
  const to = cityCode(ev.venueCity ?? ev.venue.split(",").pop()), from = cityCode(t.fromCity);
  const deliver = t.deliver.toUpperCase();
  const slot = (t.pickupSlot.split("·")[0] ?? "").trim();
  const spaced = t.tag.replace(/-/g, " ");
  return `<section class="label wt">
  <div class="face">
    <header class="hb">${MARK("#fff", "#000")}<span class="word">BAGDROP</span><span class="hr"><b>${esc(ev.hashtag)}</b><i>WEDDING BAG TAG</i></span></header>
    <div class="route">
      <div class="pt"><span class="lab">FROM</span><div class="code3">${esc(from)}</div><div class="cityn">${esc((t.fromCity || "Pickup").toUpperCase())}</div></div>
      <div class="via"><span class="lab">PICKUP</span><i></i><span class="lab">${esc(short(t.pickupDate || ""))}</span></div>
      <div class="pt to"><span class="lab">TO</span><div class="code3">${esc(to)}</div><div class="cityn">${esc((ev.venueCity || ev.venue.split(",").pop() || "").trim().toUpperCase())}</div></div>
    </div>
    <div class="venue">${esc(ev.venue.toUpperCase())} · ${esc(ev.names.toUpperCase())}</div>
    <div class="deliver"><span class="lab">DELIVER TO</span><b class="${deliver.length > 13 ? "xl" : deliver.length > 10 ? "l" : ""}">${esc(deliver)}</b></div>
    <div class="grid">
      <div class="c s2"><span class="lab">GUEST</span><b>${esc(t.guest.toUpperCase())}</b><em>${esc(t.family)}</em></div>
      <div class="c"><span class="lab">BAG</span><b class="big">${t.n}<small>/${t.of}</small></b></div>
      <div class="c s2"><span class="lab">ITEM</span><b>${esc(t.bag.toUpperCase())}</b></div>
      <div class="c"><span class="lab">SIDE</span><b>${esc((t.side.split("'")[0] || "—").toUpperCase())}</b></div>
      <div class="c s2"><span class="lab">PICKUP</span><b>${esc(short([t.pickupDate, slot].filter(Boolean).join(" · ")) || "AS BOOKED")}</b></div>
      <div class="c"><span class="lab">RETURN</span><b>${esc(t.returning ? short(t.retDate || "BOOKED") : "ONE WAY")}</b>${t.returning ? `<em>${esc(to)}–${esc(from)}</em>` : ""}</div>
    </div>
    ${t.flags.length ? `<div class="flags">${t.flags.map((f) => `<span>${esc(f)}</span>`).join("")}</div>` : ""}
    <div class="bcrow">
      <div class="bcl"><div class="bc">${code128(t.tag, 12)}</div><div class="code">${esc(spaced)}</div></div>
      <div class="bqr"><div class="qr">${qr(t.tag)}</div><span>SCAN FOR STATUS</span></div>
    </div>
  </div>
  <div class="perf">TEAR HERE · GUEST CLAIM STUB</div>
  <div class="stub">
    <div class="sl">
      <div class="sh">${MARK("#000", "#fff")}<b>BAGDROP</b><span>CLAIM STUB</span></div>
      <div class="sdest${(from + to + deliver).length > 20 ? " sm" : ""}">${esc(from)}–${esc(to)} · ${esc(deliver)}</div>
      <div class="sname">${esc(t.guest)} · BAG ${t.n} OF ${t.of}</div>
      <div class="sbc">${code128(t.tag, 8)}</div>
      <div class="scode">${esc(spaced)}</div>
    </div>
    <div class="sqr">${qr(t.tag)}</div>
  </div>
</section>`;
}

/* every size is in "u": 1u = 1 mm on a 4×6 tag; smaller media scale u down */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.noprint{font:13px/1.5 -apple-system,Arial,sans-serif;padding:10px 14px;background:#fff7ed;border-bottom:1px solid #fed7aa}
@media print{.noprint{display:none}}
.label{overflow:hidden;page-break-after:always;break-after:page}
.label:last-child{page-break-after:auto;break-after:auto}
.wt{width:calc(100*var(--u));height:calc(150*var(--u));display:flex;flex-direction:column;font-size:calc(3*var(--u))}
.face{flex:1;display:flex;flex-direction:column;min-height:0}.face>*{flex-shrink:0}
.lab{font-size:calc(2*var(--u));font-weight:700;letter-spacing:.14em}
.hb{flex:none;display:flex;align-items:center;gap:calc(2*var(--u));background:#000;color:#fff;height:calc(12*var(--u));padding:0 calc(4*var(--u))}
.hb .mark{height:calc(8*var(--u));width:auto}
.hb .word{font-size:calc(6*var(--u));font-weight:900;letter-spacing:.08em}
.hb .hr{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;line-height:1.05}
.hb .hr b{font-size:calc(4.6*var(--u));font-weight:900;letter-spacing:.04em}.hb .hr i{font-style:normal;font-size:calc(1.9*var(--u));font-weight:700;letter-spacing:.18em}
.route{display:flex;align-items:stretch;gap:calc(2*var(--u));padding:calc(2.4*var(--u)) calc(4*var(--u)) 0}
.pt{display:flex;flex-direction:column}.pt.to{align-items:flex-end;text-align:right}
.code3{font-family:"Arial Black","Helvetica Neue",Arial,sans-serif;font-weight:900;font-size:calc(15.5*var(--u));line-height:.86;letter-spacing:-.03em;margin-top:calc(.8*var(--u))}
.cityn{font-size:calc(2.8*var(--u));font-weight:800;letter-spacing:.08em;margin-top:calc(1.2*var(--u));white-space:nowrap}
.via{flex:1;min-width:calc(14*var(--u));white-space:nowrap;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(1*var(--u));padding-top:calc(2*var(--u))}
.via i{display:block;width:100%;border-top:calc(.7*var(--u)) solid #000}
.venue{margin:calc(1.8*var(--u)) calc(4*var(--u)) 0;padding-top:calc(1.2*var(--u));border-top:calc(.35*var(--u)) solid #000;font-size:calc(2.4*var(--u));font-weight:700;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qr svg,.sqr svg,.bc svg,.sbc svg{display:block;width:100%;height:100%}
.deliver{background:#000;color:#fff;margin-top:calc(2*var(--u));padding:calc(1.2*var(--u)) calc(4*var(--u)) calc(1.6*var(--u));display:flex;flex-direction:column}
.deliver b{font-family:"Arial Black","Helvetica Neue",Arial,sans-serif;font-weight:900;font-size:calc(10*var(--u));line-height:1;letter-spacing:.01em;white-space:nowrap;overflow:hidden}.deliver b.l{font-size:calc(8*var(--u));line-height:1.2}.deliver b.xl{font-size:calc(6.4*var(--u));line-height:1.5}
.grid{display:grid;grid-template-columns:1fr 1fr calc(28*var(--u));margin:0 calc(4*var(--u));border-bottom:calc(.35*var(--u)) solid #000}
.c{padding:calc(1*var(--u)) calc(1.6*var(--u)) calc(1*var(--u)) 0;border-top:calc(.35*var(--u)) solid #000;display:flex;flex-direction:column;min-width:0}
.c+.c:not(.s2){padding-left:calc(2*var(--u));border-left:calc(.35*var(--u)) solid #000}
.c.s2{grid-column:span 2}
.c b{font-size:calc(4*var(--u));font-weight:900;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c b.big{font-size:calc(7*var(--u));line-height:1}.c b.big small{font-size:calc(4*var(--u))}
.c em{font-style:normal;font-size:calc(2.5*var(--u));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.flags{display:flex;gap:calc(1.6*var(--u));margin:calc(1.6*var(--u)) calc(4*var(--u)) 0}
.flags span{border:calc(.6*var(--u)) solid #000;font-weight:900;font-size:calc(3.6*var(--u));letter-spacing:.1em;padding:calc(.5*var(--u)) calc(2*var(--u))}
.bcrow{display:flex;align-items:flex-end;gap:calc(3*var(--u));margin:auto calc(4*var(--u)) 0;padding-top:calc(1.6*var(--u))}
.bcl{flex:1;min-width:0;display:flex;flex-direction:column}
.bc{height:calc(12*var(--u))}.bc svg{margin:0 auto}
.bqr{width:calc(17*var(--u));flex:none;display:flex;flex-direction:column;align-items:center;gap:calc(.6*var(--u))}
.bqr .qr{width:calc(17*var(--u));height:calc(17*var(--u))}.bqr span{font-size:calc(1.5*var(--u));font-weight:700;letter-spacing:.08em;white-space:nowrap}
.code{text-align:center;font-family:ui-monospace,Menlo,"Courier New",monospace;font-weight:800;font-size:calc(4*var(--u));letter-spacing:.12em;margin-top:calc(.8*var(--u))}
.perf{flex:none;margin:calc(1.6*var(--u)) 0 0;border-top:calc(.4*var(--u)) dashed #000;text-align:center;font-size:calc(1.7*var(--u));font-weight:700;letter-spacing:.2em;padding-top:calc(.6*var(--u))}
.stub{flex:none;height:calc(28*var(--u));display:flex;gap:calc(3*var(--u));padding:calc(1.2*var(--u)) calc(4*var(--u)) calc(3*var(--u))}
.sl{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(.7*var(--u))}
.sh{display:flex;align-items:center;gap:calc(1.2*var(--u))}.sh .mark{height:calc(4.4*var(--u));width:auto}.sh b{font-size:calc(3.2*var(--u));font-weight:900;letter-spacing:.08em}.sh span{margin-left:auto;font-size:calc(2*var(--u));font-weight:800;letter-spacing:.16em}
.sdest{font-family:"Arial Black","Helvetica Neue",Arial,sans-serif;font-size:calc(4.6*var(--u));font-weight:900;line-height:1;white-space:nowrap;overflow:hidden}.sdest.sm{font-size:calc(3.5*var(--u));line-height:1.3}
.sname{font-size:calc(2.6*var(--u));font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbc{height:calc(7*var(--u))}.scode{font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:calc(2.6*var(--u));letter-spacing:.1em}
.sqr{width:calc(22*var(--u));height:calc(22*var(--u));flex:none;align-self:center}`;

const SIZE: Record<WeddingTagMedia, { css: string; paper: string }> = {
  "4x6": {
    paper: "100 × 150 mm (4×6 in) thermal labels",
    css: `@page{size:100mm 150mm;margin:0}.wt{--u:1mm}`,
  },
  ql62x100: {
    paper: "Brother QL-800 · DK-11202 die-cut 62 × 100 mm labels (paper 62mm x 100mm, margins None, scale 100%)",
    /* 62 mm wide: the tag face at 0.62 scale with the claim stub left off, inside the driver's 1.5 mm / 3 mm printable inset */
    css: `@page{size:62mm 100mm;margin:0}
.wt{--u:.59mm;width:62mm;height:100mm;padding:3mm 0 3mm}
.perf,.stub{display:none}
.hb,.deliver{margin-left:1.5mm;margin-right:1.5mm}.hb{height:calc(14*var(--u))}.lab{font-size:1.5mm}.cityn{font-size:1.9mm}.venue{font-size:1.6mm}.c em{font-size:1.8mm}
.code3{font-size:calc(15*var(--u))}.via{min-width:calc(12*var(--u))}.route{padding-top:calc(3*var(--u))}.deliver{margin-top:calc(4*var(--u));padding-top:calc(2*var(--u));padding-bottom:calc(2.6*var(--u))}
.deliver b{font-size:calc(12*var(--u))}.deliver b.l{font-size:calc(9.6*var(--u))}.deliver b.xl{font-size:calc(7.6*var(--u))}
.c{padding-top:calc(2*var(--u));padding-bottom:calc(2*var(--u))}.c b{font-size:calc(4.6*var(--u))}
.bc{height:calc(20*var(--u))}.code{font-size:2.4mm}.bqr{width:calc(22*var(--u))}.bqr .qr{width:calc(22*var(--u));height:calc(22*var(--u))}.bqr span{display:none}`,
  },
  a4: {
    paper: "A4, 4 tags per sheet: cut along the dashed lines",
    css: `@page{size:A4;margin:8mm}
.sheet{display:grid;grid-template-columns:96mm 96mm;grid-auto-rows:139mm;gap:2mm;justify-content:center;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
.sheet .label{page-break-after:auto;break-after:auto;outline:.3mm dashed #999;outline-offset:1mm;justify-self:center}
.wt{--u:.92mm}`,
  },
};

/** One print-ready HTML document with a tag for every bag of the given bookings. */
export function weddingTagsHtml(bookings: Booking[], media: WeddingTagMedia, ev: TagEvent, title: string, opts: { autoPrint?: boolean; only?: (b: Booking) => Set<string> } = {}): string {
  const tags = bookings.flatMap((b) => { const keep = opts.only?.(b); return weddingTags(b).filter((t) => !keep || keep.has(t.tag)); });
  const faces = tags.map((t) => tagHtml(t, ev));
  const body = media === "a4"
    ? Array.from({ length: Math.ceil(faces.length / 4) }, (_, i) => `<div class="sheet">${faces.slice(i * 4, i * 4 + 4).join("")}</div>`).join("\n")
    : faces.join("\n");
  const size = SIZE[media];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · bag tags</title>
<style>${CSS}${size.css}</style></head><body>
<p class="noprint"><b>${esc(title)}</b> · ${tags.length} bag tag${tags.length === 1 ? "" : "s"} from ${bookings.length} booking${bookings.length === 1 ? "" : "s"} · print on <b>${size.paper}</b> at 100% scale (no "fit to page"). ${esc(COMPANY.name)}</p>
${body || "<p style='padding:20mm;font:16px Arial'>No bags to print yet.</p>"}
${opts.autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),350)</script>` : ""}
</body></html>`;
}
