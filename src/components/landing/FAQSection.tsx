"use client";
import { useState } from "react";
import { FAQ } from "./data";
import { Icon } from "./Icon";
import { Section, SectionHeading } from "./SectionHeading";

export default function FAQSection() {
  const [cat, setCat] = useState(0);
  const [open, setOpen] = useState(0);
  const items = FAQ[cat].items;

  return (
    <Section id="faq" tone="paper">
      <SectionHeading kicker="FAQ" title="Questions," accent="answered." />
      <div className="mb-6 flex flex-wrap gap-2">
        {FAQ.map((c, i) => (
          <button
            key={c.cat}
            type="button"
            onClick={() => { setCat(i); setOpen(0); }}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${i === cat ? "bg-ink text-white" : "bg-paper text-graphite hover:bg-line"}`}
          >
            {c.cat}
          </button>
        ))}
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
        {items.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[15px] font-semibold text-ink">{f.q}</span>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-colors ${isOpen ? "bg-brand text-white" : "bg-paper text-graphite"}`}>
                  <Icon name="chevronDown" size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen && <p className="px-5 pb-4 text-[14px] leading-relaxed text-graphite">{f.a}</p>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
