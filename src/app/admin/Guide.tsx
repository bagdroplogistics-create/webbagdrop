"use client";
/** How a booking moves, start to finish — the same five phases for every
 *  kind of booking, with what the team does at each one, where, and what
 *  the client receives. Shown inside Operations ("How it works") and as a
 *  printable page at /admin/guide. Rules: src/lib/journey.ts. */
import { useState } from "react";
import { PHASES } from "@/lib/journey";
import { withBase } from "@/lib/basePath";

type Kind = "web" | "wed" | "partner";
const KINDS: { k: Kind; name: string; blurb: string }[] = [
  { k: "web", name: "Website booking", blurb: "A traveller books on bagdrop.co: quote, approval, payment, then the move." },
  { k: "wed", name: "Wedding or event", blurb: "A family books on the event page; the hosts pay, so there is no payment step for the guest." },
  { k: "partner", name: "Partner booking", blurb: "A travel agent or hotel books through the partner desk; their wallet or credit is charged." },
];

interface Step { team: string; where: string; client: string }
const G: Record<Kind, Step[]> = {
  web: [
    { team: "The request lands in Shipments with its chart price (or 'rate on request'). Check the lane, bags and dates; set a team price if there is no chart price. Accept, revise the price, hold, ask the client a question, or decline.", where: "Shipments → Quotes & payments", client: "Acknowledgement in 15 minutes; then the approved price with the payment link, or the revised price, or the question." },
    { team: "Wait for the payment. If the client uploads a proof (UPI or bank), Finance verifies it. A gateway payment is captured on its own.", where: "Finance → Payments to verify", client: "'Payment received' once it is verified, and the Move Pass." },
    { team: "Nothing to do: the LR is issued automatically within a minute and the booking appears in Operations as 'To assign pickup'. Assign the pickup captain and vehicle under Legs (from the Captains and Vehicles masters); the brief opens on WhatsApp.", where: "Operations → Legs & assignment", client: "The captain's name and phone, with the pickup window." },
    { team: "Everything is recorded by the team in Operations. Pickup: tick each bag's tag and seal from the printed set, type its weight, attach its photo, attach the client's signature, and note the captain, vehicle and time. Middle mile: origin hub (from the Hubs master), the line-haul (mode, vendor, LR or AWB, vehicle, driver, expected arrival) and the arrival with its seal check. Last mile: assign the delivery captain, send it out for delivery with an expected time. Raise a problem the moment one happens; clear it when it is solved. Undo the latest step if it was a mistake (a reason is required).", where: "Operations (every entry is marked 'entered by ops')", client: "A message at every step: picked up, reached our hub, departed with the expected arrival, arrived, delivery captain, out for delivery, any problem with the new time. Live tracking throughout." },
    { team: "Delivery: record who took the bags and their relation to the traveller, the time, and the handover photo if there is one. The POD is on the booking. The invoice went out at payment; Finance reconciles the bank or gateway line against it.", where: "Operations → Delivered · POD", client: "'Delivered' naming who received the bags; the tracking link ends." },
  ],
  wed: [
    { team: "The family's request lands under the event in Weddings & events (and in Shipments). Check the guests, bags and dates. Confirm the family; there is no price for the guest when the hosts pay.", where: "Weddings & events → the event → the family", client: "'Request received'; then 'Confirmed by Bagdrop, the hosts are covering this'." },
    { team: "Nothing to do: a host-billed family counts as billed the moment it is confirmed. The event's commercials (rate per bag, direction, sectors) drive the host's bill.", where: "Weddings & events → Commercials", client: "Nothing extra; the Move Pass and tags." },
    { team: "The LR is issued automatically and the family appears in Operations as 'To assign pickup'. Assign the pickup captain for the family's city and date (the event's pickup day).", where: "Operations → Legs & assignment", client: "The captain's name and phone, with the pickup window." },
    { team: "Same moves as any booking: check-in per bag at pickup, hub, line-haul to the venue city, arrival with seal check, delivery to the hotel or room. Each bag's stage also shows on the event's manifest and the guest's My bags page. Return bags follow the same path back after the event.", where: "Operations · the event manifest (/e/<code>?ops=1) mirrors the stages", client: "Messages at every step and live tracking; the My bags page shows each tag." },
    { team: "Delivery to the room or the hotel desk: receiver (often the hotel desk), relation, time and photo. POD per family.", where: "Operations → Delivered · POD", client: "'Delivered' naming who received the bags." },
  ],
  partner: [
    { team: "The partner's booking lands in Shipments marked with the agent. Price per the partner's chart; accept it.", where: "Shipments → Quotes & payments", client: "The partner gets 'booking received'; the traveller the acknowledgement." },
    { team: "Nothing to do: the partner's wallet or credit is charged on acceptance (full retail; commission is paid back on settlement). Top-ups are recorded in Partners & API.", where: "Partners & API → wallet", client: "The partner sees the charge in their portal." },
    { team: "The LR is issued automatically; assign the pickup captain in Operations.", where: "Operations → Legs & assignment", client: "The traveller gets the captain's details; the partner gets the same updates in their portal." },
    { team: "Same moves as any booking, with the same proof at each step.", where: "Operations", client: "Messages at every step to the traveller; the partner's portal mirrors them." },
    { team: "Delivery with full POD. The partner's statement picks up the completed move.", where: "Operations → Delivered · POD", client: "'Delivered'; the partner sees the move closed." },
  ],
};

const ALWAYS = [
  ["Cancel", "Any booking that isn't delivered can be cancelled from its journey panel (Shipments, Weddings & events, Operations). A reason is required and the client is told it. A paid booking's cancel alerts Finance to decide the refund."],
  ["Restore", "Every cancelled booking keeps the stage it was at. Restore (same places, plus the 'Show cancelled' list in Operations) puts it back exactly: status, LR, captain, steps, tags. The client is told it is back on. If it was paid, Finance is asked to confirm no refund went out."],
  ["Undo a step", "In Operations, the latest completed step can be taken back with a written reason. Tracking goes back; the client is not messaged again when the step is redone."],
  ["Problems", "Delayed, held, short bag, damage, seal broken, RTO: raise it in Operations with what you are doing and a new time. The client gets a message and sees it on tracking until you clear it."],
  ["Quote after payment", "Open the paid booking on the quote desk and change it: the chart re-prices it. Price up: a top-up falls due and the client gets the link. Price down: a credit note is issued. Both are logged and the client is told."],
  ["LR after issue", "Open the issued LR on the LR desk and edit any field. The number stays, each amendment is logged with a reason, and the printed note shows the latest version."],
  ["Aadhaar and driver app", "Both off in phase 1: nothing asks the client to verify, and captains get no app links; the team records every step. Settings NEXT_PUBLIC_AADHAAR_REQUIRED=1 and NEXT_PUBLIC_DRIVER_APP=1 bring them back."],
] as const;

export default function Guide({ print = false }: { print?: boolean }) {
  const [kind, setKind] = useState<Kind>("web");
  const kinds = print ? KINDS : KINDS.filter((x) => x.k === kind);
  return (
    <div className="grid gap-5 text-[13px]">
      {!print && (
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map((x) => (
            <button key={x.k} onClick={() => setKind(x.k)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold ${kind === x.k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{x.name}</button>
          ))}
          <a className="ml-auto text-xs font-semibold text-brand hover:underline" href={withBase("/admin/tutorial")} target="_blank" rel="noreferrer">Step-by-step tutorial with screens</a>
          <a className="text-xs font-semibold text-brand hover:underline" href={withBase("/admin/tutorial/wedding")} target="_blank" rel="noreferrer">Weddings &amp; events tutorial</a>
          <a className="text-xs font-semibold text-brand hover:underline" href={withBase("/admin/guide")} target="_blank" rel="noreferrer">Printable guide (all three)</a>
        </div>
      )}
      {kinds.map((x) => (
        <section key={x.k} className="rounded-2xl border border-line bg-white p-4 print:break-inside-avoid print:border-0 print:p-0">
          <h3 className="font-display text-base font-bold">{x.name}</h3>
          <p className="mb-3 text-muted">{x.blurb}</p>
          <ol className="grid gap-3">
            {G[x.k].map((s, i) => (
              <li key={i} className="grid gap-1 rounded-xl border border-line p-3 sm:grid-cols-[150px_1fr]">
                <div><span className="inline-block rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">{i + 1} · {PHASES[i]}</span></div>
                <div className="grid gap-1">
                  <p><b>Team:</b> {s.team}</p>
                  <p className="text-muted"><b>Where:</b> {s.where}</p>
                  <p className="text-muted"><b>Client gets:</b> {s.client}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section className="rounded-2xl border border-line bg-white p-4 print:border-0 print:p-0">
        <h3 className="font-display text-base font-bold">At any point</h3>
        <dl className="mt-2 grid gap-2">
          {ALWAYS.map(([k, v]) => (
            <div key={k} className="grid gap-0.5 sm:grid-cols-[150px_1fr]"><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
