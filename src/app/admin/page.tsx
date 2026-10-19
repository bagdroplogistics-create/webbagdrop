"use client";
import { useState } from "react";
import AdminShell, { type ModuleKey } from "./AdminShell";
import CommandCentre from "./CommandCentre";
import CRM from "./CRM";
import Finance from "./Finance";
import Inbox from "./Inbox";
import LRAndTrips from "./LRAndTrips";
import Pricing from "./Pricing";
import QuotesAndPayments from "./QuotesAndPayments";
import StubModule from "./StubModule";

const STUB_NAMES: Partial<Record<ModuleKey, string>> = {
  exc: "Exceptions",
  evt: "Events & bulk",
  drv: "Drivers",
  flt: "Flights",
  cap: "Capacity & roster",
  id: "Identity & compliance",
  part: "Partners & API",
  rules: "Rules & notifications",
  integ: "Integrations",
  sec: "Security & audit",
  data: "Data & privacy",
};

export default function AdminPage() {
  const [tab, setTab] = useState<ModuleKey>("cmd");

  return (
    <AdminShell tab={tab} setTab={setTab}>
      {tab === "cmd" && <CommandCentre />}
      {tab === "ship" && <Inbox />}
      {tab === "quote" && <QuotesAndPayments />}
      {tab === "lr" && <LRAndTrips />}
      {tab === "fin" && <Finance />}
      {tab === "crm" && <CRM />}
      {tab === "price" && <Pricing />}
      {STUB_NAMES[tab] && <StubModule name={STUB_NAMES[tab]!} />}
    </AdminShell>
  );
}
