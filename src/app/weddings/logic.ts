"use client";
/** Wedding guest landing page logic — ported line-for-line from the static
 *  build's wedding.js. Loads the event record by ?code= and books families.
 *  Only the data calls changed:
 *   - DB.watchDoc("events", code)  -> watchEvent (anon select, RLS-limited
 *                                     to open events; polls for changes)
 *   - DB.put("bookings", id, doc)  -> createBooking (create_booking RPC —
 *                                     the real id is assigned server-side)
 *   - DB.list("bookings")+filter   -> trackEventBookings (server route; needs
 *                                     the full mobile, returns a reduced view)
 */
import { createBooking, newBookingId, nowIso } from "@/lib/db";
import { trackEventBookings, watchEvent } from "@/lib/eventDb";
import type { BagdropEvent, Booking } from "@/lib/types";

export function initWeddingLanding(): () => void {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const val = (id: string) => (($(id) as HTMLInputElement).value || "").trim();
  const esc = (s: unknown) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  const cleanups: (() => void)[] = [];
  const code = new URLSearchParams(location.search).get("code");
  let EV: BagdropEvent | null = null;

  if (!code) { $("notfound").hidden = false; return () => {}; }

  cleanups.push(watchEvent(code, (e) => {
    if (!e) { $("notfound").hidden = false; $("page").hidden = true; return; }
    EV = e;
    $("notfound").hidden = true;
    $("page").hidden = false;
    render(e);
  }));

  let cityWired = false;
  function render(e: BagdropEvent) {
    const L = e.landing || {};
    document.title = (L.names || e.name) + " · Travel light";
    $("l-place").textContent = (e.venue || "") + (e.venueCity ? " · " + e.venueCity.toUpperCase() : "");
    $("l-names").textContent = L.names || e.name;
    $("l-dates").textContent = L.datesText || (e.dates.in + " → " + e.dates.out);
    $("l-footnames").textContent = L.names || e.name;
    $("l-footdates").textContent = L.datesText || "";
    $("l-foothash").textContent = L.hashtag || "";
    $("l-destp").textContent = L.destination || ("Every bag gets its own tag, linked to the person it belongs to and the room they're staying in. You see each one move, and you get a photo when it reaches your room.");
    if (L.celebration) $("l-stripp").textContent = L.celebration;

    const hostPays = e.billing === "host";
    $("l-chips").innerHTML = [
      hostPays ? "No payment needed" : "Simple family billing",
      "Room-matched delivery", "Tagged & sealed", "Live tracking",
      e.direction === "both" ? "Return home included" : null,
    ].filter(Boolean).map((c) => '<span class="chip"><i></i>' + c + "</span>").join("");
    $("l-booklede").textContent = "About three minutes. " + (hostPays ? "No payment: the hosts have covered it." : "We confirm the details with you on WhatsApp.") + " You confirm with a one-time Aadhaar code at the end.";

    /* pickup cities = sectors only */
    const citySel = $("w-city") as HTMLSelectElement;
    const prevCity = citySel.value;
    citySel.innerHTML = e.sectors.map((s) => '<option value="' + esc(s.city) + '">' + esc(s.city) + "</option>").join("");
    if (prevCity) citySel.value = prevCity;
    if (!cityWired) { cityWired = true; citySel.addEventListener("change", showDays); }
    showDays();

    const sideSel = $("w-side") as HTMLSelectElement;
    const prevSide = sideSel.value;
    const sides = (L.sides || "Bride side · Groom side").split("·").map((s) => s.trim()).filter(Boolean);
    sideSel.innerHTML = sides.map((s) => "<option>" + esc(s) + "</option>").join("") + "<option>Friends & others</option>";
    if (prevSide) sideSel.value = prevSide;

    countdown(e.dates.in);
  }

  function sectorFor(city: string) {
    return (EV?.sectors || []).filter((s) => s.city === city)[0];
  }
  function showDays() {
    const s = sectorFor(val("w-city"));
    if (!s || !EV) return;
    $("w-days").innerHTML = "<b>" + esc(s.city) + "</b> · pickup at your door on <b>" + esc(s.pickDay) + "</b>" +
      (EV.direction !== "out" ? ", bags home again after <b>" + esc(s.retDay) + "</b>" : "") + ". We message the exact window the evening before.";
  }

  let cdTimer: ReturnType<typeof setInterval> | null = null;
  function countdown(dateIso: string) {
    const target = new Date(dateIso + "T00:00:00");
    function tick() {
      let d = target.getTime() - Date.now();
      if (d < 0) d = 0;
      $("cd-d").textContent = String(Math.floor(d / 86400000));
      $("cd-h").textContent = String(Math.floor(d / 3600000) % 24);
      $("cd-m").textContent = String(Math.floor(d / 60000) % 60);
      $("cd-s").textContent = String(Math.floor(d / 1000) % 60);
    }
    tick();
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(tick, 1000);
  }
  cleanups.push(() => { if (cdTimer) clearInterval(cdTimer); });

  /* bags stepper */
  let bags = 2;
  $("w-minus").addEventListener("click", () => { bags = Math.max(1, bags - 1); $("w-n").textContent = String(bags); });
  $("w-plus").addEventListener("click", () => { bags = Math.min(20, bags + 1); $("w-n").textContent = String(bags); });

  /* reserve */
  let aadShown = false;
  let saving = false;
  $("w-go").addEventListener("click", () => {
    const msg = $("w-msg");
    msg.textContent = "";
    if (!EV || saving) return;
    if (!val("w-fam") || !val("w-lead")) { msg.textContent = "Family name and the lead guest's name are needed."; return; }
    if (!/^\+?[\d\s-]{10,15}$/.test(val("w-mob"))) { msg.textContent = "Enter a valid mobile number."; return; }
    if (!val("w-addr")) { msg.textContent = "Add the pickup address."; return; }
    if (!($("w-proh") as HTMLInputElement).checked || !($("w-ind") as HTMLInputElement).checked) { msg.textContent = "Please tick both declarations."; return; }
    if (!aadShown) {
      aadShown = true;
      $("w-aadbox").hidden = false;
      $("w-go").textContent = "Confirm and reserve";
      return;
    }
    if (val("w-aad") !== "112233") { msg.textContent = "The Aadhaar code is not right. (demo code: 112233)"; return; }

    const s = sectorFor(val("w-city"));
    const doc: Booking = {
      id: newBookingId(), created: nowIso(), status: "submitted",
      eventCode: EV.id, eventName: EV.name,
      uc: "wed", ucName: "Wedding · " + ((EV.landing || {}).names || EV.name), mode: "road",
      from: val("w-city"), to: EV.venueCity,
      pickAddr: val("w-addr"), dropAddr: EV.venue || EV.venueCity,
      zo: "", zd: "", date: s ? s.pickDay : EV.dates.in, ref: EV.id,
      slot: "Wedding pickup day",
      bags, oversize: 0, billed: Math.max(bags, (EV.rates || {}).minBags || 2),
      traveller: { name: val("w-lead"), mobile: val("w-mob"), email: "", res: "in" },
      family: { name: val("w-fam"), side: val("w-side") },
      payer: EV.billing === "host" ? { name: "Host account · " + EV.id, contact: (EV.contacts || {}).hostMobile || "" } : null,
      note: val("w-note"),
      quote: { qid: null, total: s ? s.rate * Math.max(bags, (EV.rates || {}).minBags || 2) * (EV.direction === "both" ? 2 : 1) : 0, breakdown: { internal: true } as Booking["quote"]["breakdown"] },
      identity: { ok: true, at: nowIso(), method: "DigiLocker (guest link)", score: 0.95 },
      pay: null, admin: {}, events: [{ at: nowIso(), by: "customer", text: "Family booked on the wedding landing page · " + EV.id }],
    };
    saving = true;
    $("w-go").textContent = "Saving…";
    createBooking(doc).then((saved) => {
      saving = false;
      $("formview").hidden = true;
      $("doneview").hidden = false;
      $("w-ref").textContent = saved.id;
      $("w-donedays").innerHTML = "<b>" + esc(val("w-fam")) + "</b> · " + bags + " bags from " + esc(val("w-city")) +
        " · pickup " + esc(s ? s.pickDay : EV!.dates.in) + (EV!.direction !== "out" ? " · home again after " + esc(s ? s.retDay : EV!.dates.out) : "") + ".";
    }).catch(() => {
      saving = false;
      $("w-go").textContent = "Confirm and reserve";
      msg.textContent = "Could not save the booking. Check your connection and try again.";
    });
  });

  /* track by mobile */
  $("l-trackgo").addEventListener("click", () => {
    const mob = val("l-trackmob").replace(/\s|-/g, "");
    if (!mob || !EV) return;
    if (mob.replace(/\D/g, "").length < 10) {
      $("l-trackBox").innerHTML = '<p class="hint">Enter the full 10-digit mobile you booked with.</p>';
      return;
    }
    trackEventBookings(EV.id, mob).then((mine) => {
      if (!mine.length) { $("l-trackBox").innerHTML = '<p class="hint">No booking found with that mobile for this event.</p>'; return; }
      const LABEL: Record<string, string> = { submitted: "Reserved", accepted: "Confirmed", assigned: "Captain assigned", picked_up: "Picked up", in_transit: "On the way", delivered: "Delivered", revised: "Being confirmed", rejected: "Could not confirm", cancelled: "Cancelled" };
      $("l-trackBox").innerHTML = mine.map((d) =>
        '<div class="trk"><div class="top"><div><b>' + esc(d.familyName || d.travellerName) + "</b> · " + d.bags + " bags · " + esc(d.from) +
        " → " + esc(d.to) + '</div><span class="state">' + (LABEL[d.status] || d.status) + "</span></div>" +
        '<div class="hint" style="margin-top:6px">' + esc(d.id) + " · pickup " + esc(d.date) + "</div></div>"
      ).join("");
    }).catch(() => {
      $("l-trackBox").innerHTML = '<p class="hint">Could not reach the tracker. Try again in a moment.</p>';
    });
  });

  return () => { cleanups.forEach((f) => f()); };
}
