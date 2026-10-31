/** Server-only: print-ready bag tags, backup labels, handling stickers and
 *  security seals — as HTML (exact physical sizes, vector barcodes) and as
 *  Zebra ZPL II (203 dpi) for thermal printers.
 *
 *  Media
 *   loopstock  airline loop-tag stock, 54 × 457 mm (2⅛ × 18 in)
 *   4x6        100 × 150 mm thermal label (the loop tag folds through the
 *              handle and sticks back to itself)
 *   ql62x100   Brother QL-800 (300 dpi) on DK-11202 die-cut 62 × 100 mm
 *              labels — a loop tag prints as two labels: the tag face and
 *              the customer claim stub
 *   ql62       Brother QL-800 on DK-22205 / DK-22251 continuous 62 mm
 *              tape — the loop tag is one 62 × 210 mm strip (face · fold ·
 *              stub); every other label is cut at 100 mm
 *   a4         office printer: loop tags 2 per page (cut on the line);
 *              backup labels, stickers and seals 8-up on A4 label sheets
 *              (99.1 × 67.7 mm — print seals on VOID tamper-evident stock)
 *  Black only (thermal-safe). Every number is printed beside its barcode. */
import { code128, qr } from "./barcodes";
import { STICKER_TEXT, spaced, stickersOf, type BagRecord, type Sticker } from "./bagTags";
import { portCode } from "./opsModel";
import { COMPANY } from "./company";
import type { Booking } from "./types";

export type LabelKind = "loop" | "backup" | "stickers" | "seals" | "all";
export type Media = "loopstock" | "4x6" | "a4" | "ql62x100" | "ql62";
export const LABEL_KINDS: LabelKind[] = ["loop", "backup", "stickers", "seals", "all"];
export const MEDIA: Media[] = ["loopstock", "4x6", "a4", "ql62x100", "ql62"];
const isQL = (m: Media) => m === "ql62x100" || m === "ql62";

export interface TagCtx {
  id: string; from: string; to: string; fromCode: string; toCode: string;
  date: string; deliveryDate: string | null; name: string; total: number; xl: number; site: string;
}
export function tagCtx(b: Booking, site: string): TagCtx {
  /* airline style: first name + surname initial (numbers in a name are skipped) */
  const parts = (b.traveller?.name ?? "").trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  const name = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] ?? "";
  return {
    id: b.id, from: b.from, to: b.to, fromCode: portCode(b.from), toCode: portCode(b.to),
    date: (b.pickupDate || b.date || "").slice(0, 10), deliveryDate: b.deliveryDate ?? null,
    name, total: b.bags + b.oversize, xl: b.oversize, site: site.replace(/\/$/, ""),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).toUpperCase() : "—");
export const bagUrl = (c: TagCtx, bag: BagRecord) => `${c.site}/b/${bag.plate}`;

/* ---------------- HTML pieces ---------------- */
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;color:#000;background:#fff}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.bc svg{display:block;width:100%;height:100%}
.noprint{font:13px/1.5 -apple-system,Arial,sans-serif;padding:10px 14px;background:#fff7ed;border-bottom:1px solid #fed7aa}
.noprint b{font-weight:700}
@media print{.noprint{display:none}}
.xlband{background:#000;color:#fff;font-weight:900;text-align:center;letter-spacing:.08em}
.label{overflow:hidden;position:relative;page-break-after:always;break-after:page}
.label:last-child{page-break-after:auto;break-after:auto}
`;

function loopFace(c: TagCtx, bag: BagRecord, compact: boolean): string {
  const s = stickersOf(bag).filter((x) => x !== "XL");
  return `
  <div class="hdr"><b>BAGDROP</b><span>BAG TAG · ${day(c.date)}</span></div>
  <div class="dest"><div class="code mono">${esc(c.toCode)}</div><div class="city">${esc(c.to.toUpperCase())}</div></div>
  <div class="route mono">FROM ${esc(c.fromCode)} ${esc(c.from.toUpperCase())}${c.deliveryDate ? ` · BY ${day(c.deliveryDate)}` : ""}</div>
  <div class="bc bch">${code128(bag.plate, compact ? 13 : 16)}</div>
  <div class="plate mono">${spaced(bag.plate)}</div>
  <div class="piece"><span>PIECE <b>${bag.n}</b> OF ${c.total}</span>${s.length ? `<span class="flags">${s.map((x) => esc(x)).join(" · ")}</span>` : ""}</div>
  ${bag.xl ? `<div class="xlband">XL · OVERSIZE</div>` : ""}
  <div class="pax"><span>${esc(c.name.toUpperCase())}</span><span class="mono">${esc(c.id)}</span></div>
  <div class="ref mono">${esc(bag.code)}</div>`;
}
function stub(c: TagCtx, bag: BagRecord): string {
  return `
  <div class="stub">
    <div class="stubh"><b>CUSTOMER CLAIM STUB</b><span>keep until delivery</span></div>
    <div class="stubrow"><span class="mono big">${esc(c.toCode)}</span><span class="mono">${spaced(bag.plate)}</span></div>
    <div class="bc bcs">${code128(bag.plate, 7)}</div>
    <div class="stubrow small"><span>PIECE ${bag.n}/${c.total}${bag.xl ? " · XL" : ""}</span><span class="mono">${esc(c.id)}</span></div>
  </div>`;
}

function loopStock(c: TagCtx, bag: BagRecord): string {
  return `<section class="label loopstock">
  ${loopFace(c, bag, false)}
  <div class="vert"><div class="bc bcv">${code128(bag.plate, 14, "R")}</div><div class="qrbox"><div class="bc">${qr(bagUrl(c, bag))}</div><span>SCAN · FOUND THIS BAG?</span></div></div>
  <div class="glue">ADHESIVE END · loop through the handle and stick here</div>
  <div class="tear">✂ - - - - - - - - - - - - tear - - - - - - - - - - - -</div>
  ${stub(c, bag)}
</section>`;
}
/* Brother QL-800: 62 mm wide; die-cut → face + stub as two labels, continuous → one strip */
function loopQl(c: TagCtx, bag: BagRecord, continuous: boolean): string {
  const face = `<div class="qlface">${loopFace(c, bag, true)}<div class="qlqr"><div class="bc">${qr(bagUrl(c, bag))}</div><span>FOUND THIS BAG? SCAN</span></div></div>`;
  if (continuous) return `<section class="label qlstrip">${face}
  <div class="fold">▲ FOLD · loop through the handle · stick back ▲</div>
  <div class="tear">✂ - - - - - - - tear - - - - - - -</div>${stub(c, bag)}</section>`;
  return `<section class="label ql100 qltag">${face}</section><section class="label ql100 qlstub">${stub(c, bag)}</section>`;
}

function loop4x6(c: TagCtx, bag: BagRecord): string {
  return `<section class="label l46">
  <div class="face">
    <div class="facemain">${loopFace(c, bag, true)}</div>
    <div class="faceqr"><div class="bc">${qr(bagUrl(c, bag))}</div><span>FOUND THIS BAG?<br>SCAN</span></div>
  </div>
  <div class="fold">▲ FOLD · loop through the handle · stick this strip back to the tag ▲</div>
  <div class="tear">✂ - - - - - - - - - - - - - - tear - - - - - - - - - - - - - -</div>
  ${stub(c, bag)}
</section>`;
}
function backup(c: TagCtx, bag: BagRecord): string {
  return `<section class="label backup">
  <div class="row"><b>BAGDROP · BACKUP LABEL</b><span class="mono">${esc(c.fromCode)} → ${esc(c.toCode)}</span></div>
  <div class="bc bcb">${code128(bag.plate, 14)}</div>
  <div class="row"><span class="mono plate2">${spaced(bag.plate)}</span><span class="mono dest2">${esc(c.toCode)}</span></div>
  <div class="row small"><span>PIECE ${bag.n}/${c.total}${bag.xl ? " · <b>XL</b>" : ""} · ${esc(c.name.toUpperCase())}</span><span class="mono">${esc(c.id)}</span></div>
</section>`;
}
/* Black-only ISO-style pictograms (thermal printers can't do colour or grey —
 * emoji would dither into a blotch). Stroke-based SVG, scales to any label. */
const svgIcon = (body: string) => `<svg viewBox="0 0 48 48" fill="none" stroke="#000" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const PICTO: Record<Sticker, string> = {
  FRAGILE: svgIcon(`<path d="M14 5h20l-1.5 13a8.5 8.5 0 0 1-17 0z"/><path d="M24 26.5V40M15 43h18"/><path d="M19 9l4 5-3 3 4 4" stroke-width="2.4"/>`),
  UP: svgIcon(`<path d="M15 34V9M8 16l7-7 7 7M33 34V9M26 16l7-7 7 7M7 41h34"/>`),
  HEAVY: svgIcon(`<path d="M18 13a6 6 0 1 1 12 0"/><path d="M12 17h24l5 25H7z"/><text x="24" y="36" fill="#000" stroke="none" font-size="10" font-weight="900" text-anchor="middle" font-family="Arial">KG</text>`),
  PRIORITY: svgIcon(`<path fill="#000" d="M24 5l5.6 12 13.1 1.4-9.8 8.8 2.8 12.8L24 33.4 12.3 40l2.8-12.8-9.8-8.8L18.4 17z"/>`),
  XL: svgIcon(`<rect x="7" y="13" width="34" height="27" rx="3"/><path d="M18 13V8h12v5"/><text x="24" y="33" fill="#000" stroke="none" font-size="12" font-weight="900" text-anchor="middle" font-family="Arial">XL</text>`),
};
function sticker(c: TagCtx, bag: BagRecord, s: Sticker): string {
  return `<section class="label sticker">
  <div class="sicon">${PICTO[s]}</div>
  <div class="sword">${esc(STICKER_TEXT[s])}</div>
  <div class="row small"><span class="mono">${spaced(bag.plate)} · ${bag.n}/${c.total}</span><span>BAGDROP</span></div>
</section>`;
}
function seal(c: TagCtx, bag: BagRecord): string {
  return `<section class="label seal">
  <div class="row"><b>SECURITY SEAL</b><span class="void">VOID IF REMOVED</span></div>
  <div class="bc bcb">${code128(bag.seal!, 12)}</div>
  <div class="row"><span class="mono plate2">${spaced(bag.seal!)}</span><span class="mono">${bag.n}/${c.total}</span></div>
  <div class="row small"><span>Bag ${spaced(bag.plate)} · ${esc(c.id)}</span><span>Do not accept if broken</span></div>
</section>`;
}

/* QL-800 driver: printable area on 62 mm is inset 1.5 mm at the sides and
 * 3 mm top and bottom (PPD ImageableArea) — keep every mark inside it */
const QL_CSS = `
@page{size:62mm 100mm;margin:0}@page strip{size:62mm 210mm;margin:0}
.qlstrip{page:strip;width:62mm;height:210mm;padding:3.6mm 2.6mm;display:flex;flex-direction:column;gap:1.4mm}
.ql100{width:62mm;height:100mm;padding:3.6mm 2.6mm;display:flex;flex-direction:column;justify-content:center;gap:1.4mm}
.qltag{justify-content:flex-start}
.qlface{display:flex;flex-direction:column;gap:1.1mm}
.hdr{display:flex;justify-content:space-between;align-items:baseline;font-size:2.4mm}.hdr b{font-size:3.6mm}
.dest{display:flex;align-items:baseline;gap:2mm}.dest .code{font-size:13mm;font-weight:900;line-height:.9}.dest .city{font-size:2.8mm;font-weight:700}
.route{font-size:2.1mm;font-weight:700;border-top:.3mm solid #000;border-bottom:.3mm solid #000;padding:.6mm 0}
.bch{height:11mm}.plate{font-size:4mm;font-weight:800;white-space:nowrap}
.piece{display:flex;justify-content:space-between;font-size:2.5mm}.piece b{font-size:3.6mm}.flags{font-weight:800}
.xlband{font-size:3.8mm;padding:.8mm 0;white-space:nowrap}
.pax{display:flex;justify-content:space-between;font-size:2.3mm;font-weight:700}.ref{font-size:1.9mm}
.qlqr{display:flex;align-items:center;gap:2mm;font-size:2mm;font-weight:700}.qlqr .bc{width:15mm;height:15mm}
.fold{border:.3mm dashed #000;font-size:2.2mm;font-weight:700;text-align:center;padding:10mm 1mm;flex:1}
.tear{font-size:2mm;text-align:center;white-space:nowrap;overflow:hidden}
.stub{border:.3mm solid #000;padding:1.6mm;display:flex;flex-direction:column;gap:1mm}
.stubh{display:flex;justify-content:space-between;font-size:2.1mm}.stubrow{display:flex;justify-content:space-between;align-items:baseline;font-size:2.6mm}.stubrow .big{font-size:7mm;font-weight:900}.small{font-size:2.1mm}.bcs{height:9mm}
.qlstub .stub{border:none;padding:0;gap:2mm}.qlstub .stubrow .big{font-size:14mm}.qlstub .bcs{height:14mm}
.backup,.sticker,.seal{width:62mm;height:100mm;padding:4mm 2.8mm;display:flex;flex-direction:column;justify-content:center;gap:2.5mm}
.row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;font-size:2.4mm;gap:.6mm 1.5mm}.bcb{height:20mm}.plate2{font-size:4.2mm;font-weight:800;white-space:nowrap}.dest2{font-size:8mm;font-weight:900}
.sicon{height:20mm;display:flex;justify-content:center}.sicon svg{height:100%;width:auto}.sword{font-size:7mm;font-weight:900;text-align:center;line-height:1.05;border:.8mm solid #000;padding:3mm 1mm}
.void{font-weight:900;border:.4mm solid #000;padding:.3mm 1.2mm}`;

const SIZE_CSS: Record<Media, string> = {
  ql62x100: QL_CSS, ql62: QL_CSS,
  loopstock: `@page{size:54mm 457mm;margin:0}
.loopstock{width:54mm;height:457mm;padding:3mm 3mm 2mm;display:flex;flex-direction:column;gap:1.6mm}
.hdr{display:flex;flex-direction:column;font-size:2.8mm;line-height:1.2}.hdr b{font-size:4.6mm;letter-spacing:.04em}
.dest .code{font-size:21mm;font-weight:900;line-height:.9;letter-spacing:-.02em}.dest .city{font-size:3.4mm;font-weight:700}
.route{font-size:2.6mm;font-weight:700;border-top:.4mm solid #000;border-bottom:.4mm solid #000;padding:1mm 0}
.bch{height:18mm}.plate{font-size:4.3mm;font-weight:800;text-align:center;white-space:nowrap}
.piece{display:flex;justify-content:space-between;font-size:3.2mm}.piece b{font-size:5mm}.flags{font-weight:800}
.xlband{font-size:5mm;padding:1.2mm 0;white-space:nowrap}
.pax{display:flex;justify-content:space-between;font-size:3mm;font-weight:700}.ref{font-size:2.4mm}
.vert{display:flex;gap:2mm;height:78mm}.bcv{width:20mm;height:78mm}.qrbox{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1mm;font-size:2.2mm;font-weight:700;text-align:center}.qrbox .bc{width:24mm;height:24mm}
.glue{flex:1;min-height:40mm;border:.4mm dashed #000;display:flex;align-items:center;justify-content:center;text-align:center;font-size:2.8mm;padding:2mm;writing-mode:vertical-rl}
.tear{font-size:2.4mm;text-align:center;white-space:nowrap;overflow:hidden}
.stub{border:.4mm solid #000;padding:2mm;display:flex;flex-direction:column;gap:1.2mm}
.stubh{display:flex;flex-direction:column;font-size:2.4mm}.stubrow{display:flex;flex-direction:column;font-size:3mm}.stubrow .big{font-size:7mm;font-weight:900}.small{font-size:2.4mm}.bcs{height:8mm}`,
  "4x6": `@page{size:100mm 150mm;margin:0}
.l46{width:100mm;height:150mm;padding:3.5mm;display:flex;flex-direction:column;gap:1.5mm}
.face{display:flex;gap:3mm;height:92mm}.facemain{flex:1;display:flex;flex-direction:column;gap:1.3mm;min-width:0}
.faceqr{width:26mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:1mm;font-size:2.2mm;font-weight:700;text-align:center}.faceqr .bc{width:24mm;height:24mm}
.hdr{display:flex;justify-content:space-between;align-items:baseline;font-size:2.8mm}.hdr b{font-size:4mm}
.dest{display:flex;align-items:baseline;gap:2.5mm}.dest .code{font-size:16mm;font-weight:900;line-height:.9}.dest .city{font-size:3.4mm;font-weight:700}
.route{font-size:2.5mm;font-weight:700;border-top:.35mm solid #000;border-bottom:.35mm solid #000;padding:.8mm 0}
.bch{height:13mm}.plate{font-size:5mm;font-weight:800;letter-spacing:.03em}
.piece{display:flex;justify-content:space-between;font-size:3mm}.piece b{font-size:4.4mm}.flags{font-weight:800}
.xlband{font-size:4.6mm;padding:1mm 0}.pax{display:flex;justify-content:space-between;font-size:2.8mm;font-weight:700}.ref{font-size:2.3mm}
.fold{border:.35mm dashed #000;background:repeating-linear-gradient(135deg,#fff 0 2mm,#eee 2mm 4mm);font-size:2.6mm;font-weight:700;text-align:center;padding:4mm 1mm;flex:1}
.tear{font-size:2.3mm;text-align:center;white-space:nowrap;overflow:hidden}
.stub{border:.35mm solid #000;padding:1.8mm;display:flex;flex-direction:column;gap:1mm}
.stubh{display:flex;justify-content:space-between;font-size:2.4mm}.stubrow{display:flex;justify-content:space-between;align-items:baseline;font-size:3mm}.stubrow .big{font-size:6mm;font-weight:900}.small{font-size:2.4mm}.bcs{height:7mm}
.backup,.sticker,.seal{width:100mm;height:150mm;padding:8mm;display:flex;flex-direction:column;justify-content:center;gap:4mm}
.row{display:flex;justify-content:space-between;align-items:baseline;font-size:3.6mm;gap:3mm}.bcb{height:34mm}.plate2{font-size:7mm;font-weight:800}.dest2{font-size:12mm;font-weight:900}
.sicon{height:34mm;display:flex;justify-content:center}.sicon svg{height:100%;width:auto}.sword{font-size:12mm;font-weight:900;text-align:center;line-height:1.05;border:1.2mm solid #000;padding:5mm 2mm}
.void{font-weight:900;border:.5mm solid #000;padding:.5mm 2mm}`,
  a4: `@page{size:A4;margin:8mm 5mm}
.sheet{display:grid;grid-template-columns:99.1mm 99.1mm;grid-auto-rows:67.7mm;gap:0 2mm;justify-content:center}
.sheet .label{page-break-after:auto;break-after:auto;break-inside:avoid;border:.2mm dashed #bbb}
.pair{display:flex;gap:4mm;justify-content:center;page-break-after:always;break-after:page}.pair:last-child{page-break-after:auto}
.pair .l46{border:.3mm dashed #999;page-break-after:auto;break-after:auto}
.backup,.sticker,.seal{width:99.1mm;height:67.7mm;padding:4mm 5mm;display:flex;flex-direction:column;justify-content:center;gap:2mm}
.row{display:flex;justify-content:space-between;align-items:baseline;font-size:2.8mm;gap:2mm}.bcb{height:17mm}.plate2{font-size:4.6mm;font-weight:800}.dest2{font-size:7mm;font-weight:900}.small{font-size:2.3mm}
.sicon{height:14mm;display:flex;justify-content:center}.sicon svg{height:100%;width:auto}.sword{font-size:7mm;font-weight:900;text-align:center;border:.8mm solid #000;padding:2mm}
.void{font-weight:900;border:.4mm solid #000;padding:.3mm 1.5mm}`,
};

/** One printable HTML document. */
export function labelsHtml(kind: LabelKind, media: Media, c: TagCtx, bags: BagRecord[], opts: { autoPrint?: boolean } = {}): string {
  const kinds: Exclude<LabelKind, "all">[] = kind === "all" ? ["loop", "backup", "stickers", "seals"] : [kind];
  const blocks: string[] = [];
  const pieces: string[] = [];
  for (const k of kinds) {
    if (k === "loop") {
      const tags = bags.map((bag) => (media === "loopstock" ? loopStock(c, bag) : isQL(media) ? loopQl(c, bag, media === "ql62") : loop4x6(c, bag)));
      if (media === "a4") for (let i = 0; i < tags.length; i += 2) blocks.push(`<div class="pair">${tags.slice(i, i + 2).join("")}</div>`);
      else blocks.push(...tags);
    } else {
      const items = k === "backup" ? bags.map((bag) => backup(c, bag))
        : k === "seals" ? bags.filter((bag) => bag.seal).map((bag) => seal(c, bag))
        : bags.flatMap((bag) => stickersOf(bag).map((s) => sticker(c, bag, s)));
      if (media === "a4") pieces.push(...items); else blocks.push(...items);
    }
  }
  if (media === "a4" && pieces.length) blocks.push(`<div class="sheet">${pieces.join("")}</div>`);
  if (media === "loopstock" && kind !== "loop") throw new Error("LOOPSTOCK_IS_FOR_LOOP_TAGS");
  /* A4 reuses the 4×6 loop-tag face (2 per page); its own rules come last and win */
  const css = media === "a4" ? SIZE_CSS["4x6"] + SIZE_CSS.a4 : SIZE_CSS[media];
  const paper = media === "loopstock" ? "loop-tag stock (54 × 457 mm)" : media === "4x6" ? "100 × 150 mm (4×6 in) thermal labels"
    : media === "ql62x100" ? "Brother QL-800 · DK-11202 die-cut 62 × 100 mm labels — in the print dialog choose paper 62mm x 100mm, margins None, scale 100%"
    : media === "ql62" ? "Brother QL-800 · DK-22205 continuous 62 mm tape — paper 62mm (continuous), margins None, scale 100%; loop tags cut at 210 mm, other labels at 100 mm" : "A4 — 8-up label sheets for labels/stickers/seals (seals on VOID tamper-evident stock); loop tags print 2 per page, cut on the dashed line";
  const count = blocks.length ? "" : "<p style='padding:20mm;font:16px Arial'>Nothing to print for this selection.</p>";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.id)} · ${kind} labels</title>
<style>${BASE_CSS}${css}</style></head><body>
<p class="noprint"><b>${esc(c.id)}</b> · ${c.total} piece(s)${c.xl ? ` (${c.xl} XL)` : ""} · print on <b>${paper}</b> at 100% scale (no "fit to page"). ${COMPANY.name}</p>
${blocks.join("\n")}${count}
${opts.autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),350)</script>` : ""}
</body></html>`;
}

/* ---------------- ZPL II (Zebra, 203 dpi = 8 dots/mm) ---------------- */
const z = (s: string) => s.replace(/[\^~\\]/g, " ");
function zplLoop(c: TagCtx, bag: BagRecord, stock: boolean): string {
  const w = stock ? 431 : 812, flags = stickersOf(bag).filter((x) => x !== "XL").join(" ");
  const L: string[] = ["^XA", "^CI28", `^PW${w}`, `^LL${stock ? 3656 : 1218}`, "^LH0,0"];
  if (stock) {
    L.push(`^FO24,24^A0N,34,34^FDBAGDROP^FS`, `^FO230,30^A0N,24,24^FD${z(day(c.date))}^FS`,
      `^FO24,80^A0N,170,150^FD${z(c.toCode)}^FS`, `^FO24,260^A0N,30,28^FD${z(c.to.toUpperCase())}^FS`,
      `^FO24,310^A0N,22,22^FDFROM ${z(c.fromCode)} ${z(c.from.toUpperCase())}^FS`,
      `^FO30,360^BY2^BCN,140,N,N,N^FD>:${bag.plate}^FS`, `^FO24,515^A0N,40,34^FD${z(spaced(bag.plate))}^FS`,
      `^FO24,575^A0N,28,28^FDPIECE ${bag.n} OF ${c.total}  ${z(flags)}^FS`);
    if (bag.xl) L.push(`^FO24,620^GB383,60,60^FS`, `^FO60,630^A0N,44,40^FR^FDXL OVERSIZE^FS`);
    L.push(`^FO24,700^A0N,26,24^FD${z(c.name.toUpperCase())}  ${z(c.id)}^FS`, `^FO24,735^A0N,20,18^FD${z(bag.code)}^FS`,
      `^FO30,790^BY2^BCR,150,N,N,N^FD>:${bag.plate}^FS`, `^FO230,820^BQN,2,5^FDQA,${bagUrl(c, bag)}^FS`,
      `^FO24,1450^GB383,700,3^FS`, `^FO120,1700^A0R,30,28^FDADHESIVE END - STICK HERE^FS`,
      `^FO24,2300^A0N,22,20^FD- - - - - - TEAR - - - - - -^FS`,
      `^FO24,2350^A0N,24,22^FDCUSTOMER CLAIM STUB^FS`, `^FO24,2390^A0N,70,60^FD${z(c.toCode)}^FS`,
      `^FO24,2470^A0N,30,28^FD${z(spaced(bag.plate))}^FS`, `^FO30,2515^BY2^BCN,70,N,N,N^FD>:${bag.plate}^FS`,
      `^FO24,2600^A0N,22,22^FDPIECE ${bag.n}/${c.total}${bag.xl ? " XL" : ""}  ${z(c.id)}^FS`);
  } else {
    L.push(`^FO28,28^A0N,32,32^FDBAGDROP  BAG TAG  ${z(day(c.date))}^FS`,
      `^FO28,70^A0N,130,115^FD${z(c.toCode)}^FS`, `^FO300,110^A0N,28,26^FD${z(c.to.toUpperCase())}^FS`,
      `^FO28,210^A0N,22,22^FDFROM ${z(c.fromCode)} ${z(c.from.toUpperCase())}${c.deliveryDate ? `  BY ${z(day(c.deliveryDate))}` : ""}^FS`,
      `^FO28,250^BY3^BCN,110,N,N,N^FD>:${bag.plate}^FS`, `^FO28,372^A0N,42,36^FD${z(spaced(bag.plate))}^FS`,
      `^FO28,425^A0N,28,26^FDPIECE ${bag.n} OF ${c.total}  ${z(flags)}^FS`);
    if (bag.xl) L.push(`^FO28,465^GB560,46,46^FS`, `^FO60,472^A0N,36,34^FR^FDXL OVERSIZE^FS`);
    L.push(`^FO28,525^A0N,24,22^FD${z(c.name.toUpperCase())}  ${z(c.id)}^FS`, `^FO28,555^A0N,20,18^FD${z(bag.code)}^FS`,
      `^FO600,330^BQN,2,5^FDQA,${bagUrl(c, bag)}^FS`,
      `^FO28,760^GB756,150,3^FS`, `^FO60,815^A0N,26,24^FDFOLD - LOOP THROUGH HANDLE - STICK BACK^FS`,
      `^FO28,930^A0N,20,18^FD- - - - - - - - - - - - - TEAR - - - - - - - - - - - - -^FS`,
      `^FO28,965^A0N,24,22^FDCUSTOMER CLAIM STUB^FS`, `^FO28,1000^A0N,70,60^FD${z(c.toCode)}^FS`,
      `^FO250,1015^A0N,36,32^FD${z(spaced(bag.plate))}^FS`, `^FO28,1080^BY2^BCN,70,N,N,N^FD>:${bag.plate}^FS`,
      `^FO28,1165^A0N,22,22^FDPIECE ${bag.n}/${c.total}${bag.xl ? " XL" : ""}  ${z(c.id)}^FS`);
  }
  L.push("^XZ");
  return L.join("\n");
}
function zplBig(lines: string[]): string {
  return ["^XA", "^CI28", "^PW812", "^LL1218", "^LH0,0", ...lines, "^XZ"].join("\n");
}
export function labelsZpl(kind: LabelKind, media: Media, c: TagCtx, bags: BagRecord[]): string {
  if (media === "a4" || isQL(media)) throw new Error("ZPL_IS_FOR_THERMAL");
  if (media === "loopstock" && kind !== "loop") throw new Error("LOOPSTOCK_IS_FOR_LOOP_TAGS");
  const kinds: Exclude<LabelKind, "all">[] = kind === "all" ? ["loop", "backup", "stickers", "seals"] : [kind];
  const out: string[] = [];
  for (const k of kinds) for (const bag of bags) {
    if (k === "loop") out.push(zplLoop(c, bag, media === "loopstock"));
    if (k === "backup") out.push(zplBig([`^FO40,60^A0N,34,32^FDBAGDROP BACKUP LABEL   ${z(c.fromCode)} > ${z(c.toCode)}^FS`,
      `^FO60,160^BY4^BCN,300,N,N,N^FD>:${bag.plate}^FS`, `^FO40,500^A0N,70,60^FD${z(spaced(bag.plate))}^FS`,
      `^FO40,600^A0N,160,140^FD${z(c.toCode)}^FS`, `^FO40,800^A0N,32,30^FDPIECE ${bag.n}/${c.total}${bag.xl ? " XL" : ""}  ${z(c.name.toUpperCase())}^FS`,
      `^FO40,850^A0N,30,28^FD${z(c.id)}^FS`]));
    if (k === "seals" && bag.seal) out.push(zplBig([`^FO40,60^A0N,48,44^FDSECURITY SEAL^FS`, `^FO440,60^GB330,60,4^FS`, `^FO460,72^A0N,36,32^FDVOID IF REMOVED^FS`,
      `^FO60,180^BY4^BCN,280,N,N,N^FD>:${bag.seal}^FS`, `^FO40,500^A0N,70,60^FD${z(spaced(bag.seal))}^FS`,
      `^FO40,600^A0N,30,28^FDBAG ${z(spaced(bag.plate))}  ${bag.n}/${c.total}^FS`, `^FO40,650^A0N,30,28^FD${z(c.id)} - DO NOT ACCEPT IF BROKEN^FS`]));
    if (k === "stickers") for (const s of stickersOf(bag)) out.push(zplBig([`^FO40,300^GB732,420,12^FS`,
      `^FO80,420^A0N,${STICKER_TEXT[s].length > 12 ? 70 : 120},${STICKER_TEXT[s].length > 12 ? 60 : 110}^FD${z(STICKER_TEXT[s])}^FS`,
      `^FO40,900^A0N,30,28^FD${z(spaced(bag.plate))}  ${bag.n}/${c.total}  BAGDROP^FS`]));
  }
  return out.join("\n");
}

