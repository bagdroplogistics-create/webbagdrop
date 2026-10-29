/** Executive dashboard payload types — client-safe (types only, no server
 *  imports). Produced by src/lib/metricsServer.ts behind /api/admin/metrics
 *  (full payload, admin cookie) and /api/board/metrics (one department,
 *  signed read-only board token). */

export type ViewKey = "ceo" | "ops" | "fin" | "sales" | "comm" | "wed";
export type Period = "today" | "7d" | "mtd" | "fy";

export const VIEWS: { key: ViewKey; name: string }[] = [
  { key: "ceo", name: "CEO" },
  { key: "ops", name: "Operations" },
  { key: "fin", name: "Finance" },
  { key: "sales", name: "Sales & CRM" },
  { key: "comm", name: "Commercial" },
  { key: "wed", name: "Weddings" },
];

export const PERIODS: { key: Period; name: string }[] = [
  { key: "today", name: "Today" },
  { key: "7d", name: "7 days" },
  { key: "mtd", name: "MTD" },
  { key: "fy", name: "FY" },
];

/** A KPI's previous-period comparison. pct is null when the previous period
 *  had nothing to compare against. */
export interface Delta { prev: number; pct: number | null }

/** One item on a department's "needs attention" list. module/id let the
 *  admin dashboard deep-link into the owning module / booking record. */
export interface Attention { text: string; module?: string; id?: string }

export interface TrendDay { day: string; v: number }
export interface Trend { label: string; days: TrendDay[] }

export interface Metrics {
  asOf: string;
  period: Period;
  periodLabel: string;
  start: string;
  /** Previous comparison window (same length, immediately before `start`). */
  prevStart: string;
  series: {
    days: { day: string; revenue: number; pieces: number }[];
    forecast: { day: string; mu: number; lo: number; hi: number }[];
  };
  feed: { at: string; id: string; text: string }[];
  /** KPI deltas vs the previous window, keyed by metric id. */
  deltas: Record<string, Delta>;
  /** Per-department 14-day trend (daily). */
  trends: Record<Exclude<ViewKey, "ceo">, Trend>;
  /** Per-department attention lists; ceo = the union, ranked. */
  attention: Record<ViewKey, Attention[]>;
  ceo: {
    revenue: number; gst: number; billedValue: number; bookings: number; paidCount: number;
    collected: number; marginPct: number | null;
    depts: { key: string; name: string; ok: boolean; note: string }[];
  };
  ops: {
    byStage: Record<string, number>;
    pickupsToday: number; tripsRunning: number; inCustody: number; podsPending: number;
    deliveredTotal: number; deliveredInPeriod: number;
    trips: { id: string; route: string; date: string; status: string; bookings: number; revenue: number; expenses: number; advances: number; pnl: number }[];
  };
  fin: {
    invoiced: number; collected: number; gst: number;
    receivableTotal: number; receivableCount: number;
    ageing: { bucket: string; amount: number }[];
    unreconCount: number; unreconAmount: number; docsCount: number;
  };
  sales: {
    inquiries: number; inquiriesTotal: number; conversionPct: number | null;
    pipelineValue: number; pipelineCount: number; overdueFollowups: number; rorPending: number;
  };
  comm: {
    lanes: { lane: string; bags: number; revenue: number; n: number; perBag: number }[];
    avgPerBag: number; revisedCount: number; oversizeRevenue: number; oversizeSharePct: number;
  };
  wed: {
    openEvents: number; familyBookings: number; newFamilies: number; guests: number; bagsOut: number; noRoom: number;
    events: { code: string; name: string; venue: string; dates: { in: string; out: string }; families: number }[];
  };
}
