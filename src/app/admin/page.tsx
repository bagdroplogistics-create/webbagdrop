"use client";
import { useState } from "react";
import AdminShell, { type ModuleKey } from "./AdminShell";
import CapacityAndRoster from "./CapacityAndRoster";
import CommandCentre from "./CommandCentre";
import Clients from "./Clients";
import CRM from "./CRM";
import DataAndPrivacy from "./DataAndPrivacy";
import Drivers from "./Drivers";
import EventsAndBulk from "./EventsAndBulk";
import Executive from "./Executive";
import Operations from "./Operations";
import Weddings from "./Weddings";
import LeadImport from "./LeadImport";
import Reports from "./Reports";
import Exceptions from "./Exceptions";
import Finance from "./Finance";
import Flights from "./Flights";
import Inbox from "./Inbox";
import IdentityAndCompliance from "./IdentityAndCompliance";
import Integrations from "./Integrations";
import Inspector from "./Inspector";
import LiveTracking from "./LiveTracking";
import LRAndTrips from "./LRAndTrips";
import PartnersAndApi from "./PartnersAndApi";
import Pricing from "./Pricing";
import QuotesAndPayments from "./QuotesAndPayments";
import RulesAndNotifications from "./RulesAndNotifications";
import SecurityAndAudit from "./SecurityAndAudit";

/** Shipments hub — the Shipments inbox and the Quotes & payments desk,
 *  merged into ONE module as sub-tabs. Both render unchanged, so every
 *  field, action and share link of each survives the merge. */
function ShipmentsHub({ search, initial }: { search: string; initial: "inbox" | "quotes" }) {
  const [sub, setSub] = useState<"inbox" | "quotes">(initial);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5">
        {([["inbox", "Shipments inbox"], ["quotes", "Quotes & payments"]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${sub === k ? "text-white" : "hover:opacity-80"}`}
            style={sub === k ? { background: "var(--a-navy)" } : { background: "var(--a-surface-2)", color: "var(--a-muted)" }}>{n}</button>
        ))}
      </div>
      <div key={sub} className="anim-in">
        {sub === "inbox" && <Inbox search={search} />}
        {sub === "quotes" && <QuotesAndPayments />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<ModuleKey>("cmd");
  const [search, setSearch] = useState("");

  return (
    <AdminShell tab={tab} setTab={setTab} search={search} onSearchChange={setSearch}>
      {tab === "cmd" && <CommandCentre openModule={(k) => setTab(k as ModuleKey)} />}
      {tab === "ship" && <ShipmentsHub search={search} initial="inbox" />}
      {/* the old Quotes & payments tab now lands inside Shipments, quotes sub-tab open */}
      {tab === "quote" && <ShipmentsHub search={search} initial="quotes" />}
      {tab === "lr" && <LRAndTrips search={search} />}
      {tab === "opsx" && <Operations />}
      {tab === "insp" && <Inspector />}
      {tab === "live" && <LiveTracking />}
      {tab === "dash" && <Executive openModule={(k) => setTab((k === "wed" ? "wed" : k) as ModuleKey)} />}
      {tab === "wed" && <Weddings onOpenBooking={() => setTab("ship")} />}
      {tab === "cli" && <Clients />}
      {tab === "ads" && <LeadImport />}
      {tab === "rep" && <Reports />}
      {tab === "exc" && <Exceptions />}
      {tab === "evt" && <EventsAndBulk />}
      {tab === "drv" && <Drivers />}
      {tab === "flt" && <Flights />}
      {tab === "cap" && <CapacityAndRoster />}
      {tab === "crm" && <CRM />}
      {tab === "price" && <Pricing />}
      {tab === "id" && <IdentityAndCompliance />}
      {tab === "fin" && <Finance />}
      {tab === "part" && <PartnersAndApi />}
      {tab === "rules" && <RulesAndNotifications />}
      {tab === "integ" && <Integrations />}
      {tab === "sec" && <SecurityAndAudit />}
      {tab === "data" && <DataAndPrivacy />}
    </AdminShell>
  );
}
