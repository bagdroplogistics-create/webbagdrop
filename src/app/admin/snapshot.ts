"use client";
/** Branded board snapshot — a forwardable PNG of exactly what the board
 *  says: KPI tiles with deltas, the 14-day trend, the attention list.
 *  Drawn on a canvas client-side (no dependencies, nothing leaves the
 *  browser); shared via the native share sheet (WhatsApp / Mail on phones)
 *  or downloaded as a file to attach anywhere. */
import { inr } from "@/lib/pricing";
import type { Metrics, Trend, ViewKey } from "@/lib/metricsTypes";
import { VIEWS } from "@/lib/metricsTypes";
import { kpisFor } from "./boards";

const W = 1080;
const INK = "#1c1917", MUTED = "#78716c", LINE = "#e7e5e4", PAPER = "#fafaf9";
const BRAND = "#ea580c", GREEN = "#15803d", RED = "#dc2626", AMBER = "#b45309";

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(px, py, w, h, r);
}

export function renderSnapshot(view: ViewKey, m: Metrics): Promise<Blob> {
  const name = VIEWS.find((v) => v.key === view)?.name ?? view;
  const kpis = kpisFor(view, m);
  const att = m.attention[view].slice(0, 5);
  const trend: Trend | null = view === "ceo"
    ? { label: "Revenue, last 14 days (₹)", days: m.series.days.map((d) => ({ day: d.day, v: d.revenue })) }
    : m.trends[view].days.length ? m.trends[view] : null;
  const money = view === "ceo" || view === "fin" || view === "comm";

  const pad = 56, tileH = 150, tileGap = 20;
  const trendH = trend ? 250 : 0;
  const attH = att.length ? 70 + att.length * 44 : 90;
  const H = 150 + 40 + tileH * 2 + tileGap + 40 + trendH + (trend ? 40 : 0) + attH + 110;

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const sans = (w: string, s: number) => { x.font = `${w} ${s}px Inter, -apple-system, "Segoe UI", sans-serif`; };

  /* background + header band */
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.fillStyle = BRAND; x.fillRect(0, 0, W, 150);
  x.fillStyle = "#ffffff";
  sans("800", 40); x.fillText("BAGDROP", pad, 66);
  sans("600", 26); x.fillText(`${name} board · ${m.periodLabel}`, pad, 108);
  sans("400", 22); x.fillStyle = "rgba(255,255,255,.85)";
  const at = new Date(m.asOf).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const atW = x.measureText(`as of ${at} IST`).width;
  x.fillText(`as of ${at} IST`, W - pad - atW, 108);

  /* KPI tiles, 2 × 2 */
  let y = 150 + 40;
  const tw = (W - pad * 2 - tileGap) / 2;
  kpis.slice(0, 4).forEach((k, i) => {
    const tx = pad + (i % 2) * (tw + tileGap);
    const ty = y + Math.floor(i / 2) * (tileH + tileGap);
    x.fillStyle = PAPER; roundRect(x, tx, ty, tw, tileH, 18); x.fill();
    x.strokeStyle = LINE; x.lineWidth = 2; roundRect(x, tx, ty, tw, tileH, 18); x.stroke();
    x.fillStyle = MUTED; sans("600", 22); x.fillText(k.label.toUpperCase(), tx + 26, ty + 44);
    const val = k.text ?? (k.format ? k.format(k.value) : k.value.toLocaleString("en-IN"));
    x.fillStyle = k.tone === "warn" ? AMBER : INK; sans("800", 52); x.fillText(val, tx + 26, ty + 104);
    let dx = tx + 26 + x.measureText(val).width + 16;
    if (k.delta && k.delta.pct !== null) {
      const up = k.delta.pct >= 0;
      const good = k.goodDown ? !up || k.delta.pct === 0 : up;
      x.fillStyle = good ? GREEN : RED; sans("700", 26);
      x.fillText(`${up ? "▲" : "▼"} ${Math.abs(k.delta.pct)}%`, dx, ty + 100);
      dx += x.measureText(`▲ ${Math.abs(k.delta.pct)}%`).width + 10;
    }
    if (k.hint) { x.fillStyle = MUTED; sans("400", 20); x.fillText(k.hint, tx + 26, ty + 136); }
  });
  y += tileH * 2 + tileGap + 40;

  /* trend */
  if (trend) {
    x.fillStyle = INK; sans("700", 26); x.fillText(trend.label, pad, y + 6);
    const by = y + 30, bh = trendH - 70;
    const max = Math.max(1, ...trend.days.map((d) => d.v));
    const bw = (W - pad * 2) / trend.days.length;
    trend.days.forEach((d, i) => {
      const h = Math.max(6, (d.v / max) * bh);
      x.fillStyle = i === trend.days.length - 1 ? BRAND : "rgba(234,88,12,.55)";
      roundRect(x, pad + i * bw + 4, by + bh - h, bw - 8, h, 6); x.fill();
    });
    x.fillStyle = MUTED; sans("400", 20);
    x.fillText(trend.days[0].day.slice(5), pad, by + bh + 32);
    const fmt = (v: number) => (money ? inr(v) : v.toLocaleString("en-IN"));
    const peak = `peak ${fmt(max)}`;
    x.fillText(`today · ${peak}`, W - pad - x.measureText(`today · ${peak}`).width, by + bh + 32);
    y += trendH + 40;
  }

  /* attention */
  x.fillStyle = INK; sans("700", 26); x.fillText("Needs attention", pad, y + 6);
  if (att.length === 0) {
    x.fillStyle = GREEN; sans("500", 24); x.fillText("Nothing. Clean board. ✓", pad, y + 50);
    y += 90;
  } else {
    y += 30;
    att.forEach((a) => {
      x.fillStyle = AMBER; x.beginPath(); x.arc(pad + 8, y + 18, 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = INK; sans("400", 23);
      let t = a.text;
      while (t.length > 2 && x.measureText(t).width > W - pad * 2 - 40) t = t.slice(0, -4) + "…";
      x.fillText(t, pad + 32, y + 26);
      y += 44;
    });
    y += 40;
  }

  /* footer */
  x.strokeStyle = LINE; x.beginPath(); x.moveTo(pad, H - 70); x.lineTo(W - pad, H - 70); x.stroke();
  x.fillStyle = MUTED; sans("400", 20);
  x.fillText("BAGDROP OS · internal — numbers computed live from the operating system of record", pad, H - 34);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("SNAPSHOT_FAILED"))), "image/png"));
}

/** Share through the native sheet (phones: WhatsApp, Mail, …), else download. */
export async function shareSnapshot(view: ViewKey, m: Metrics): Promise<"shared" | "downloaded"> {
  const blob = await renderSnapshot(view, m);
  const name = `bagdrop-${view}-${m.period}-${m.asOf.slice(0, 10)}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Bagdrop ${view} board` }); return "shared"; } catch { /* cancelled — fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
