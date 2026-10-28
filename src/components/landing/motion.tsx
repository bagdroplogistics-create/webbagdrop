"use client";
/** Scroll-reveal + marquee primitives for the landing page. IntersectionObserver-
 *  driven (not a scroll-position poll), cleans up on unmount, and respects
 *  prefers-reduced-motion via the CSS in globals.css. */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Arms the [data-reveal] hide-until-visible CSS only once React has
 *  actually mounted — so a JS failure (or a very slow load) leaves the
 *  page fully visible instead of stuck at opacity:0. Mount once, high in
 *  the tree. */
export function MotionGate() {
  useEffect(() => {
    document.documentElement.setAttribute("data-motion", "");
    return () => document.documentElement.removeAttribute("data-motion");
  }, []);
  return null;
}

export function Reveal({
  children, delay = 0, className, as: Tag = "div",
}: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "span" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-in", "");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} data-reveal="" style={{ transitionDelay: `${delay}ms` }} className={className}>
      {children}
    </Tag>
  );
}

/** Animates 0 → target once the element scrolls into view. Pure rAF, no interval polling. */
export function useCountUp(target: number, active: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [active, target, duration]);
  return value;
}

export function Marquee({ children, durationS = 36 }: { children: ReactNode; durationS?: number }) {
  return (
    <div className="overflow-hidden">
      <div className="bd-marquee-track flex w-max" style={{ animationDuration: `${durationS}s` }}>
        {children}
        {children}
      </div>
    </div>
  );
}
