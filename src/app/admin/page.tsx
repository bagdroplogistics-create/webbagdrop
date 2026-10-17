"use client";
import { useState } from "react";
import CommandCentre from "./CommandCentre";
import CRM from "./CRM";
import Finance from "./Finance";
import Inbox from "./Inbox";
import LRAndTrips from "./LRAndTrips";
import Pricing from "./Pricing";
import QuotesAndPayments from "./QuotesAndPayments";

type ModuleKey = "cmd" | "ship" | "quote" | "lr" | "crm" | "price" | "fin";

const MODULES: { key: ModuleKey; name: string }[] = [
  { key: "cmd", name: "Command centre" },
  { key: "ship", name: "Shipments" },
  { key: "quote", name: "Quotes & payments" },
  { key: "lr", name: "LR & trips" },
  { key: "crm", name: "CRM" },
  { key: "price", name: "Pricing" },
  { key: "fin", name: "Finance" },
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
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === m.key ? "bg-brand text-white" : "bg-paper text-ink hover:bg-stone-200"
              }`}
            >
              {m.name}
            </button>
          ))}
        </nav>

        {tab === "cmd" && <CommandCentre />}
        {tab === "ship" && <Inbox />}
        {tab === "quote" && <QuotesAndPayments />}
        {tab === "lr" && <LRAndTrips />}
        {tab === "fin" && <Finance />}
        {tab === "crm" && <CRM />}
        {tab === "price" && <Pricing />}
      </main>
    </div>
  );
}
