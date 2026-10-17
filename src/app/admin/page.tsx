"use client";
import { useState } from "react";
import CommandCentre from "./CommandCentre";
import Finance from "./Finance";
import Inbox from "./Inbox";
import LRAndTrips from "./LRAndTrips";
import QuotesAndPayments from "./QuotesAndPayments";

type ModuleKey = "cmd" | "ship" | "quote" | "lr" | "crm" | "price" | "fin";

const MODULES: { key: ModuleKey; name: string; live: boolean }[] = [
  { key: "cmd", name: "Command centre", live: true },
  { key: "ship", name: "Shipments", live: true },
  { key: "quote", name: "Quotes & payments", live: true },
  { key: "lr", name: "LR & trips", live: true },
  { key: "crm", name: "CRM", live: false },
  { key: "price", name: "Pricing", live: false },
  { key: "fin", name: "Finance", live: true },
];

export default function AdminPage() {
  const [tab, setTab] = useState<ModuleKey>("cmd");
  const current = MODULES.find((m) => m.key === tab)!;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">B</span>
            <span className="font-display text-base font-extrabold tracking-tight">BAGDROP <span className="text-brand">Admin OS</span></span>
          </span>
          <span className="text-xs text-muted">{current.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-5 flex flex-wrap gap-1.5">
          {MODULES.map((m) => (
            <button
              key={m.key}
              onClick={() => setTab(m.key)}
              title={m.live ? undefined : "Still on the static Admin OS — not yet in this app"}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === m.key ? "bg-brand text-white" : m.live ? "bg-paper text-ink hover:bg-stone-200" : "bg-paper text-faint"
              }`}
            >
              {m.name}{!m.live && " ·"}
            </button>
          ))}
        </nav>

        {tab === "cmd" && <CommandCentre />}
        {tab === "ship" && <Inbox />}
        {tab === "quote" && <QuotesAndPayments />}
        {tab === "lr" && <LRAndTrips />}
        {tab === "fin" && <Finance />}
        {(tab === "crm" || tab === "price") && (
          <div className="rounded-2xl border border-dashed border-line bg-paper p-8 text-center text-sm text-muted">
            {current.name} hasn&apos;t been ported into this app yet — still on the static Admin OS, same backend.
          </div>
        )}
      </main>
    </div>
  );
}
