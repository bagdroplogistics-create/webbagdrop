"use client";
import { useState } from "react";
import AdminShell, { type ModuleKey } from "./AdminShell";
import CapacityAndRoster from "./CapacityAndRoster";
import CommandCentre from "./CommandCentre";
import CRM from "./CRM";
import DataAndPrivacy from "./DataAndPrivacy";
import Drivers from "./Drivers";
import EventsAndBulk from "./EventsAndBulk";
import Exceptions from "./Exceptions";
import Finance from "./Finance";
import Flights from "./Flights";
import Inbox from "./Inbox";
import IdentityAndCompliance from "./IdentityAndCompliance";
import Integrations from "./Integrations";
import LRAndTrips from "./LRAndTrips";
import PartnersAndApi from "./PartnersAndApi";
import Pricing from "./Pricing";
import QuotesAndPayments from "./QuotesAndPayments";
import RulesAndNotifications from "./RulesAndNotifications";
import SecurityAndAudit from "./SecurityAndAudit";

export default function AdminPage() {
  const [tab, setTab] = useState<ModuleKey>("cmd");
  const [search, setSearch] = useState("");

  return (
    <AdminShell tab={tab} setTab={setTab} search={search} onSearchChange={setSearch}>
      {tab === "cmd" && <CommandCentre />}
      {tab === "ship" && <Inbox search={search} />}
      {tab === "quote" && <QuotesAndPayments />}
      {tab === "lr" && <LRAndTrips search={search} />}
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
