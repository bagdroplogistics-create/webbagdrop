/** shadcn-style primitives, hand-rolled and dependency-free. When the team
 *  adopts the shadcn CLI these swap out one-for-one (same names and props). */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

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

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldCls, "appearance-none", props.className)} />;
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
