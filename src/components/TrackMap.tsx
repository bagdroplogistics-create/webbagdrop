"use client";
/** The live-tracking map — a stylised India map (src/lib/geo.ts) with each
 *  move drawn on its lane and a marker that glides to its latest position.
 *  Road lanes are solid, rail dashed, air a high arc; flowing dashes show
 *  direction while a move is under way. A green ring = live phone GPS; a
 *  red pulse = past the ETA ops typed. Drag to pan, buttons / double-click
 *  to zoom, click a marker to select it. Respects reduced-motion. */
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { INDIA_PATH, MAP_H, MAP_W, project, type LatLng } from "@/lib/geo";
import type { Mode } from "@/lib/types";

export interface MapMove {
  id: string;
  from: LatLng | null; to: LatLng | null;
  fromName: string; toName: string;
  mode: Mode;
  progress: number;                 // 0 … 1 along the lane (estimate)
  pos: LatLng | null;               // where to draw the marker
  source: "gps" | "estimate" | "none";
  late: boolean;
  moving: boolean;                  // line-haul under way → flowing lane
  label: string;                    // tooltip
  trail?: LatLng[];                 // recent GPS fixes
}

const COLOR: Record<Mode, string> = { road: "#ea580c", air: "#0284c7", rail: "#7c3aed", sea: "#0d9488" };
const ICON: Record<Mode, string> = { road: "🚚", air: "✈️", rail: "🚆", sea: "⛴" };
const BEND: Record<Mode, number> = { road: 0.06, rail: 0.12, air: 0.28, sea: 0.15 };

type Pt = { x: number; y: number };
function curve(a: Pt, b: Pt, mode: Mode) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const k = BEND[mode];
  const c = { x: mx - dy * k, y: my + dx * k };
  const at = (t: number): Pt => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
  });
  return { d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, at };
}

type Box = { x: number; y: number; w: number; h: number };
const FULL: Box = { x: 0, y: 0, w: MAP_W, h: MAP_H };

function fitBox(points: Pt[]): Box {
  if (!points.length) return FULL;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 40;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let w = Math.max(x1 - x0, 260), h = Math.max(y1 - y0, 260); // never so close that India's shape is lost
  const ratio = MAP_W / MAP_H; // keep the map's aspect so nothing is squashed
  if (w / h > ratio) h = w / ratio; else w = h * ratio;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export default function TrackMap({ moves, selected, onSelect, className = "h-[480px]", showLabels = true }: {
  moves: MapMove[]; selected?: string | null; onSelect?: (id: string) => void; className?: string; showLabels?: boolean;
}) {
  const drawn = useMemo(() => moves.map((m) => {
    const a = m.from ? project(m.from) : null, b = m.to ? project(m.to) : null;
    const lane = a && b && (a.x !== b.x || a.y !== b.y) ? curve(a, b, m.mode) : null;
    const p = m.source === "gps" && m.pos ? project(m.pos) : lane ? lane.at(m.progress) : m.pos ? project(m.pos) : a ?? b;
    return { m, a, b, lane, p, trail: (m.trail ?? []).map(project) };
  }), [moves]);

  const cities = useMemo(() => {
    const c = new Map<string, Pt>();
    for (const d of drawn) {
      if (d.a) c.set(d.m.fromName, d.a);
      if (d.b) c.set(d.m.toName, d.b);
    }
    return [...c.entries()];
  }, [drawn]);

  const fit = useMemo(() => fitBox(drawn.flatMap((d) => [d.a, d.b, d.p].filter(Boolean) as Pt[])), [drawn]);
  const [view, setView] = useState<Box | null>(null);
  const box = view ?? fit;
  const scale = MAP_W / box.w; // > 1 when zoomed in
  const drag = useRef<{ x: number; y: number; box: Box } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const zoom = (f: number, at?: Pt) => {
    const c = at ?? { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const w = Math.min(MAP_W * 1.2, Math.max(60, box.w / f)), h = w * (box.h / box.w);
    setView({ x: c.x - (c.x - box.x) * (w / box.w), y: c.y - (c.y - box.y) * (h / box.h), w, h });
  };
  const toMap = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: box.x + ((e.clientX - r.left) / r.width) * box.w, y: box.y + ((e.clientY - r.top) / r.height) * box.h };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-move]")) return;
    drag.current = { x: e.clientX, y: e.clientY, box };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = svg.current!.getBoundingClientRect();
    setView({ ...d.box, x: d.box.x - ((e.clientX - d.x) / r.width) * d.box.w, y: d.box.y - ((e.clientY - d.y) / r.height) * d.box.h });
  };
  const up = () => { drag.current = null; };

  const s = 1 / Math.sqrt(scale); // keep strokes / markers readable at any zoom
  const sorted = [...drawn].sort((x, y) => Number(x.m.id === selected) - Number(y.m.id === selected));

  /* moves waiting at the same city would sit exactly on top of each other —
   * fan them out in a small ring so each one can be seen and clicked */
  const fan = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const d of drawn) if (d.p) {
      const k = `${Math.round(d.p.x / 6)},${Math.round(d.p.y / 6)}`;
      groups.set(k, [...(groups.get(k) ?? []), d.m.id]);
    }
    const off = new Map<string, { dx: number; dy: number }>();
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      ids.forEach((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        const ring = 1 + Math.floor(i / 8) * 0.8;
        off.set(id, { dx: Math.cos(a) * ring, dy: Math.sin(a) * ring });
      });
    }
    return off;
  }, [drawn]);
  const at = (id: string, p: Pt) => {
    const o = fan.get(id);
    return o ? { x: p.x + o.dx * 14 * s, y: p.y + o.dy * 14 * s } : p;
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-[#eef6fb] ${className}`}>
      <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none" role="img" aria-label="Live map of moves in progress"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        onDoubleClick={(e) => zoom(1.8, toMap(e))}>
        <style>{`
          .tm-flow { stroke-dasharray: 3 9; animation: tm-flow 1.4s linear infinite; }
          @keyframes tm-flow { to { stroke-dashoffset: -12; } }
          .tm-mark { transition: transform 1.6s cubic-bezier(.4,0,.2,1); }
          .tm-pulse { animation: tm-pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
          @keyframes tm-pulse { 0% { opacity: .7; transform: scale(.6); } 100% { opacity: 0; transform: scale(1.8); } }
          @media (prefers-reduced-motion: reduce) { .tm-flow, .tm-pulse { animation: none; } .tm-mark { transition: none; } }
        `}</style>
        <path d={INDIA_PATH} fill="#fbfaf7" stroke="#cbd5e1" strokeWidth={1.2 * s} strokeLinejoin="round" />

        {/* lanes */}
        {sorted.map(({ m, lane }) => lane && (
          <g key={`l-${m.id}`} opacity={selected && selected !== m.id ? 0.35 : 1}>
            <path d={lane.d} fill="none" stroke={COLOR[m.mode]} strokeOpacity={0.35} strokeWidth={(selected === m.id ? 3 : 2) * s}
              strokeDasharray={m.mode === "rail" ? `${5 * s} ${4 * s}` : undefined} strokeLinecap="round" />
            {m.moving && <path d={lane.d} fill="none" stroke={COLOR[m.mode]} strokeWidth={2 * s} className="tm-flow" strokeLinecap="round" />}
          </g>
        ))}

        {/* GPS trails */}
        {sorted.map(({ m, trail }) => trail.length > 1 && (
          <polyline key={`t-${m.id}`} points={trail.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#16a34a" strokeWidth={1.5 * s} strokeOpacity={0.6} strokeDasharray={`${2 * s} ${2 * s}`} />
        ))}

        {/* cities */}
        {cities.map(([name, p]) => (
          <g key={name}>
            <circle cx={p.x} cy={p.y} r={3.2 * s} fill="#0f172a" />
            {showLabels && <text x={p.x + 5 * s} y={p.y - 4 * s} fontSize={10 * s} fill="#334155" fontWeight={600} style={{ paintOrder: "stroke" }} stroke="#fbfaf7" strokeWidth={3 * s}>{name}</text>}
          </g>
        ))}

        {/* markers */}
        {sorted.map(({ m, p: p0 }) => { if (!p0) return null; const p = at(m.id, p0); return (
          <g key={`m-${m.id}`} data-move={m.id} className="tm-mark cursor-pointer" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            onClick={() => onSelect?.(m.id)} opacity={selected && selected !== m.id ? 0.55 : 1}>
            <title>{m.label}</title>
            {m.late && <circle r={14 * s} fill="#ef4444" className="tm-pulse" />}
            {m.source === "gps" && <circle r={11 * s} fill="none" stroke="#16a34a" strokeWidth={2.5 * s} />}
            <circle r={(selected === m.id ? 10 : 8.5) * s} fill="#fff" stroke={m.late ? "#ef4444" : COLOR[m.mode]} strokeWidth={(selected === m.id ? 3 : 2) * s} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={10 * s}>{ICON[m.mode]}</text>
          </g>
        ); })}
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {([["+", () => zoom(1.6)], ["−", () => zoom(1 / 1.6)], ["⤢", () => setView(null)]] as const).map(([t, fn]) => (
          <button key={t} onClick={fn} title={t === "⤢" ? "Fit to moves" : t === "+" ? "Zoom in" : "Zoom out"}
            className="grid size-7 cursor-pointer place-items-center rounded-md border border-line bg-white text-sm font-bold shadow-sm hover:bg-paper">{t}</button>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-slate-500">Stylised map · positions are estimates unless marked live GPS</p>
    </div>
  );
}
