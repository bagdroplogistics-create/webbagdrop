/** Server-only barcode rendering (bwip-js → vector SVG, so print stays
 *  crisp at any size): Code 128 for bag tags and seals, QR for phones,
 *  PDF417 for airline-grade 2D scanners on the Move Pass. */
import { toSVG } from "bwip-js/node";

type Opts = Parameters<typeof toSVG>[0];
type Rot = "N" | "R" | "L" | "I";
/* symbology-specific options (eclevel, columns) aren't in the generic type */
const svg = (o: Opts & Record<string, unknown>) => toSVG(o as Opts);

/** Code 128 — `heightMm` is the bar height; width follows the data. */
export function code128(text: string, heightMm = 14, rotate: Rot = "N"): string {
  return svg({ bcid: "code128", text, scale: 2, height: heightMm, includetext: false, rotate, paddingwidth: 0, paddingheight: 0 });
}
export function qr(text: string): string {
  return svg({ bcid: "qrcode", text, scale: 3, eclevel: "M", paddingwidth: 0, paddingheight: 0 });
}
export function pdf417(text: string): string {
  return svg({ bcid: "pdf417", text, scale: 2, columns: 6, eclevel: 4, paddingwidth: 0, paddingheight: 0 });
}
