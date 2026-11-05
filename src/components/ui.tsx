"use client";
/** shadcn-style primitives, hand-rolled and dependency-free. When the team
 *  adopts the shadcn CLI these swap out one-for-one (same names and props). */
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "default", size = "default", className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost"; size?: "default" | "sm" | "lg" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all",
        "focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-45 disabled:pointer-events-none",
        "active:translate-y-px cursor-pointer",
        variant === "default" && "bg-brand text-white hover:bg-brand-dark shadow-sm hover:shadow-[0_3px_10px_-2px_rgba(234,88,12,.45)]",
        variant === "outline" && "border border-line bg-white text-ink hover:border-stone-300 shadow-sm",
        variant === "ghost" && "text-muted hover:text-ink hover:bg-paper",
        size === "default" && "h-11 px-5 text-sm",
        size === "sm" && "h-8 px-3 text-xs rounded-lg",
        size === "lg" && "h-13 px-7 text-sm",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-line bg-white p-5 shadow-card transition-shadow hover:shadow-card-lg", className)}>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

const fieldCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] text-ink " +
  "focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15";

/** fieldCls is full width unless the caller gives its own width (w-*), which would otherwise lose to w-full in the CSS order. */
const field = (c?: string) => (c && /(^|\s)!?w-/.test(c) ? fieldCls.replace("w-full ", "") : fieldCls);
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field(props.className), props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field(props.className), "appearance-none", props.className)} />;
}

export function Badge({ tone = "muted", children }: { tone?: "ok" | "warn" | "bad" | "info" | "muted"; children: ReactNode }) {
  if (tone === "muted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-muted">
        <i className="size-1.5 rounded-full bg-current opacity-80" />
        {children}
      </span>
    );
  }
  // Colored tones use CSS-variable fallbacks (Tailwind's green/amber/red/blue
  // -50/-700 shades) so the admin-os scope's --a-* tokens can re-tint them to
  // the reference's exact ok/warn/bad/info palette, same as everything else
  // in the cascade — without affecting the customer flow's Badge usage,
  // where those --a-* variables are never defined.
  const vars: Record<string, { bg: string; fg: string }> = {
    ok: { bg: "var(--a-ok-bg, #f0fdf4)", fg: "var(--a-ok, #15803d)" },
    warn: { bg: "var(--a-warn-bg, #fffbeb)", fg: "var(--a-warn, #b45309)" },
    bad: { bg: "var(--a-bad-bg, #fef2f2)", fg: "var(--a-bad, #b91c1c)" },
    info: { bg: "var(--a-info-bg, #eff6ff)", fg: "var(--a-info, #1d4ed8)" },
  };
  const { bg, fg } = vars[tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: bg, color: fg }}>
      <i className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

/** Option tile — the service picker / payment picker pattern. */
export function Tile({
  selected, onClick, title, sub,
}: { selected: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "rounded-xl border p-3.5 text-left transition-all cursor-pointer min-w-0",
        selected
          ? "border-brand shadow-[inset_0_0_0_1.5px_var(--color-brand)] bg-white"
          : "border-line bg-white hover:border-stone-300 hover:-translate-y-0.5 hover:shadow-card"
      )}
    >
      <b className="block font-display text-[15px] font-bold">{title}</b>
      <small className="mt-0.5 block text-xs text-muted">{sub}</small>
    </button>
  );
}

/* ================= admin-only layout primitives (styles in globals.css, .admin-os scope) ================= */

/** A record's detail in a panel that slides in from the right, so the list
 *  behind it keeps the whole screen. Esc or the backdrop closes it. */
export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="a-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="a-drawer" style={wide ? { width: "min(880px, 100vw)" } : undefined} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Detail"}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-white px-5 py-3">
          <div className="min-w-0 font-display text-sm font-bold">{title}</div>
          <button onClick={onClose} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink">Close</button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </>
  );
}

/** Scrolling table frame: sticky header, hairlines, full width. */
export function TableFrame({ children, className, maxHeight }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return <div className={cx("a-table", className)} style={maxHeight ? { maxHeight } : undefined}>{children}</div>;
}

/** Row density for every table on the page (saved per browser). */
export const DENSITY_KEY = "bagdrop-density";
export function DensityToggle() {
  const set = (d: "comfortable" | "compact") => {
    try { localStorage.setItem(DENSITY_KEY, d); } catch {}
    document.querySelector(".admin-os")?.setAttribute("data-density", d);
    window.dispatchEvent(new Event("bagdrop:density"));
  };
  return (
    <span className="hidden overflow-hidden rounded-lg border border-line text-[11px] font-semibold sm:inline-flex" role="group" aria-label="Row density">
      {(["comfortable", "compact"] as const).map((d) => (
        <button key={d} onClick={() => set(d)} className="cursor-pointer px-2.5 py-1 text-muted hover:text-ink data-[on]:bg-ink data-[on]:text-white"
          data-on={typeof document !== "undefined" && (document.querySelector(".admin-os")?.getAttribute("data-density") ?? "comfortable") === d ? "" : undefined}>
          {d === "compact" ? "Compact" : "Comfortable"}
        </button>
      ))}
    </span>
  );
}
