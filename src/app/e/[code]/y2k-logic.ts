"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/** Y2K wedding desk logic (family wizard, tag preview, tracker, ops desk,
 *  countdown, nav). The booking wizard (steps, validation, tags, tracker,
 *  ops) is unchanged; the marketing chrome around it — nav, hero, banner,
 *  celebration, destination, travel — was redesigned to match the live
 *  bagdrop.co/y2k page: real photography replaces the old canvas mountain
 *  art (so the ridges()/drawArt() canvas painters and their resize listener
 *  are gone), the travel section's tag-demo preview is gone (that page has
 *  a luggage photo there instead), and step 0 ("Who's booking?") drops the
 *  phone-number "Find my family" guest-list lookup to match the live
 *  page's simpler lead-guest/mobile/email/side form. Data layer:
 *   - DB.get("bookings", code)   -> getBookingDoc (get_booking RPC, one row)
 *   - DB.put("bookings", ...)    -> saveWeddingBooking (server route; event
 *                                   must be open, same-mobile guard, status/
 *                                   admin stay server-authoritative)
 *   - DB.watchDoc(...)           -> watchBookingDoc (polls get_booking)
 *   - ops desk DB.watch(...)     -> the cookie-gated /api/admin/bookings
 *                                   route via adminApi (sign in at /admin
 *                                   first, then open /e/y2k?ops=1)
 *   - the event-seed on load moved to the Admin OS Weddings module.
 */
import { adminListBookings, adminSaveBooking } from "@/lib/adminApi";
import { getBookingDoc, saveWeddingBooking, watchBookingDoc } from "@/lib/eventDb";
import type { Booking } from "@/lib/types";

export function initY2k(): () => void {
  const ac = new AbortController();
  const signal = ac.signal;
  const timers: ReturnType<typeof setInterval>[] = [];
  const unsubs: (() => void)[] = [];

  /* ---------- Constants ---------- */
  const WEDDING = new Date("2026-12-17T00:00:00+05:30");
  const STAGES = ["Booked", "Picked up", "At hub", "In transit", "At Taj", "In room", "Return pickup", "Delivered home"];
  const STEP_NAMES = ["Family", "Travellers", "Pickups", "Bags", "Return", "Review"];
  const BAG_TYPES: [string, string][] = [
    ["large", "Large suitcase"], ["medium", "Medium suitcase"], ["cabin", "Cabin bag"], ["garment", "Garment bag"],
    ["trunk", "Trunk / duffel"], ["gift", "Gift / hamper box"], ["decor", "Décor crate"]];
  const COLOURS: [string, string][] = [["Black", "#1c1c1c"], ["Navy", "#23314f"], ["Grey", "#8b8d90"], ["Silver", "#cfd2d4"], ["Red", "#a3312a"], ["Maroon", "#6a1f2a"], ["Green", "#3f5b3a"], ["Blue", "#2f6db0"], ["Brown", "#6b4a2e"], ["Beige", "#d9c6a3"], ["Pink", "#d98fa3"], ["Other", "conic-gradient(#a3312a,#2f6db0,#3f5b3a,#d9c6a3,#a3312a)"]];
  const CONTENTS = ["Family luggage", "Bridal / groom outfits", "Wedding gifts & hampers", "Return gift boxes", "Décor material"];
  const DELIVER: [string, string][] = [["room", "Guest's room"], ["bell", "Hold at bell desk"], ["host", "Host family suite"], ["decor", "Décor team"]];
  const WEIGHTS = ["Under 10 kg", "10–20 kg", "20–32 kg", "Over 32 kg"];
  const WINDOWS: Record<string, { label: string; dates: string[] }> = { early: { label: "Early · 10–12 Dec", dates: ["10 Dec", "11 Dec", "12 Dec"] }, express: { label: "Express · 14–15 Dec", dates: ["14 Dec", "15 Dec"] } };
  const SLOTS = ["Morning · 10 AM–1 PM", "Midday · 1–3 PM", "Afternoon · 3–6 PM"];
  const RET_DATES = ["18 Dec (night)", "19 Dec", "20 Dec"];
  const RET_SLOTS = ["Before 9 AM", "9 AM–12 PM", "12–3 PM", "At checkout time"];
  const RET_DEST: [string, string][] = [["same", "Same as pickup address"], ["airport", "Udaipur airport, with me"], ["bom", "Mumbai airport arrival"], ["other", "A different address"]];
  const CITIES = ["Mumbai", "Thane", "Navi Mumbai", "Other city"];
  const EVENT_CODE = "Y2K-WED";

  /* ---------- Helpers ---------- */
  const $ = (s: string, r: Document | HTMLElement = document) => r.querySelector(s) as HTMLElement | null;
  const esc = (s: any) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const pad = (n: any) => String(n).padStart(2, "0");
  let toastT: ReturnType<typeof setTimeout> | undefined;
  function toast(t: string) { const el = $("#toast")!; el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600); }
  function getPath(o: any, p: string) { return p.split(".").reduce((a: any, k: string) => (a == null ? a : a[k]), o); }
  function setPath(o: any, p: string, v: any) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
  function hashNum(s: string) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  const phoneOk = (p: any) => /^[6-9]\d{9}$/.test(String(p || "").replace(/\D/g, "").slice(-10)) && String(p).replace(/\D/g, "").length >= 10;

  /* ---------- State ---------- */
  function blankMember(n: number) { return { id: "G" + pad(n), name: "", phone: "", room: "", roomFromList: false, note: "", arrDate: "16 Dec", arrTime: "", mode: "Flight", travelNo: "", depDate: "19 Dec", depTime: "" }; }
  function blankPickup(n: number) { return { id: "P" + n, label: n === 1 ? "Home" : "", city: "Mumbai", address: "", pincode: "", landmark: "", lift: "Lift available", contact: "", contactPhone: "", window: "early", date: "", slot: "", members: [] as string[] }; }
  function fresh(): any {
    return { family: { phone: "", lead: "", email: "", side: "", familyName: "" },
      members: [blankMember(1)], pickups: [blankPickup(1)], bags: [] as any[], extraReturn: "0", retSameRoom: "room", notes: "",
      decl: { items: false, value: false, terms: false, consent: false }, seq: { g: 1, p: 1, b: 0 } };
  }
  let S: any = fresh();
  let step = 0, maxStep = 0, showErrors = false;
  let booking: any = null;     /* saved booking document (the desk's own view) */
  let mode = "form";           /* form | done */
  let isEditor = false;
  let opsDocs: any[] = [];
  let opsRaw: Record<string, Booking> = {};
  let opsLocked = false;

  /* ---------- Validation ---------- */
  function errs(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!phoneOk(S.family.phone)) e["family.phone"] = "Enter a 10-digit Indian mobile number.";
      if (!S.family.lead.trim()) e["family.lead"] = "Enter the name of the person booking.";
      if (!S.family.side) e["family.side"] = "Choose bride's side or groom's side.";
      if (S.family.email && !/^\S+@\S+\.\S+$/.test(S.family.email)) e["family.email"] = "Check the email address.";
    }
    if (s === 1) {
      S.members.forEach((m: any, i: number) => {
        if (!m.name.trim()) e[`members.${i}.name`] = "Add a name.";
        if (m.phone && !phoneOk(m.phone)) e[`members.${i}.phone`] = "10-digit mobile, or leave blank.";
        if (dayNum(m.depDate) < dayNum(m.arrDate)) e[`members.${i}.depDate`] = "Departure is before arrival.";
      });
    }
    if (s === 2) {
      S.pickups.forEach((p: any, i: number) => {
        if (p.city === "Other city") e[`pickups.${i}.city`] = "We pick up in Mumbai, Thane and Navi Mumbai. Book anyway and we'll confirm on WhatsApp.";
        if (!p.address.trim()) e[`pickups.${i}.address`] = "Add the full address.";
        if (!/^\d{6}$/.test(p.pincode)) e[`pickups.${i}.pincode`] = "6-digit pincode.";
        if (!p.date) e[`pickups.${i}.date`] = "Choose a date.";
        if (!p.slot) e[`pickups.${i}.slot`] = "Choose a time slot.";
        if (!p.members.length) e[`pickups.${i}.members`] = "Tick whose bags are collected here.";
        if (p.contactPhone && !phoneOk(p.contactPhone)) e[`pickups.${i}.contactPhone`] = "10-digit mobile.";
      });
    }
    if (s === 3) {
      if (!S.bags.length) e["bags"] = "Add at least one bag.";
      S.bags.forEach((b: any, i: number) => {
        if (!b.owner) e[`bags.${i}.owner`] = "Whose bag is this?";
        if (!b.pickup) e[`bags.${i}.pickup`] = "Where do we collect it?";
        if (!b.colour) e[`bags.${i}.colour`] = "Pick the closest colour.";
        if (b.contents === "Bridal / groom outfits" && !(+b.value > 0)) e[`bags.${i}.value`] = "Declare a value for outfits.";
      });
    }
    if (s === 4) {
      S.bags.forEach((b: any, i: number) => { if (!b.ret) return;
        if (!b.retDate) e[`bags.${i}.retDate`] = "Date";
        if (!b.retSlot) e[`bags.${i}.retSlot`] = "Time";
        if (b.retDest === "other" && !b.retAddress.trim()) e[`bags.${i}.retAddress`] = "Add the return address.";
      });
    }
    if (s === 5) { for (const k of ["items", "value", "terms", "consent"]) if (!S.decl[k]) e["decl." + k] = "Required"; }
    return e;
  }
  const softErr = (k: string) => k.endsWith(".city");
  function stepValid(s: number) { const e = errs(s); return Object.keys(e).filter((k) => !softErr(k)).length === 0; }
  function dayNum(d: string) { return parseInt(d, 10) || 0; }

  /* ---------- Field builders ---------- */
  let E: Record<string, string> = {};
  function err(k: string) { return showErrors && E[k] ? `<span class="msg">${esc(E[k])}</span>` : ""; }
  function bad(k: string) { return showErrors && E[k] ? " bad" : ""; }
  function inp(k: string, label: string, o: any = {}) {
    const v = getPath(S, k) ?? "";
    return `<label class="f${bad(k)}${o.full ? " full" : ""}"><span>${label}${o.opt ? " <em>(optional)</em>" : ""}</span>
  <input id="f-${k.replace(/\./g, "-")}" type="${o.type || "text"}" data-b="${k}" value="${esc(v)}" placeholder="${esc(o.ph || "")}"${o.ro ? " readonly" : ""}${o.im ? ` inputmode="${o.im}"` : ""}${o.max ? ` maxlength="${o.max}"` : ""} autocomplete="${o.ac || "off"}">
  ${o.hint ? `<span class="hint">${o.hint}</span>` : ""}${err(k)}</label>`;
  }
  function sel(k: string, label: string, opts: any[], o: any = {}) {
    const v = getPath(S, k) ?? "";
    const list = opts.map((x) => (Array.isArray(x) ? x : [x, x]));
    return `<label class="f${bad(k)}${o.full ? " full" : ""}"><span>${label}${o.opt ? " <em>(optional)</em>" : ""}</span>
  <select id="f-${k.replace(/\./g, "-")}" data-b="${k}"${o.re ? ' data-re="1"' : ""}>${o.ph ? `<option value="">${esc(o.ph)}</option>` : ""}${list.map(([val, t]) => `<option value="${esc(val)}"${String(v) === String(val) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
  ${o.hint ? `<span class="hint">${o.hint}</span>` : ""}${err(k)}</label>`;
  }
  function memberName(id: string) { const m = S.members.find((x: any) => x.id === id); return m ? (m.name || m.id) : "—"; }
  function memberRoom(id: string) { const m = S.members.find((x: any) => x.id === id); return m && m.room ? m.room : ""; }
  function tagId(b: any) { const fam = bookingCode(); return `${fam}-${b.owner || "G??"}-${b.id}`; }
  function bookingCode() { return booking ? booking.bookingId : ("Y2K-F" + String(hashNum(S.family.phone || "x") % 9000 + 1000)); }

  /* ---------- Step renderers ---------- */
  function rStep0() {
    const f = S.family;
    return `<h3 class="ph">Who's booking?</h3><p class="psub">Start with the lead guest. You can add family members, pickups and bags in the next steps.</p>
  <div class="grid">
    ${inp("family.lead", "Lead guest name", { ph: "Full name", ac: "name" })}
    ${inp("family.phone", "Mobile / WhatsApp", { type: "tel", im: "numeric", max: 13, ph: "10-digit number", ac: "tel" })}
    ${inp("family.email", "Email", { type: "email", opt: true, ph: "your@email.com", ac: "email" })}
    <div class="f full${bad("family.side")}"><span class="lab">You're a guest of</span>
      <div class="seg" style="margin-top:7px">
        <label><input type="radio" name="side" data-b="family.side" value="bride"${f.side === "bride" ? " checked" : ""}><span>Bride's side · Yashna</span></label>
        <label><input type="radio" name="side" data-b="family.side" value="groom"${f.side === "groom" ? " checked" : ""}><span>Groom's side · Yash</span></label>
      </div>${err("family.side")}</div>
  </div>`;
  }
  function rStep1() {
    return `<h3 class="ph">Who's travelling?</h3><p class="psub">Add everyone in your family who has bags, with their own room. Travel times help us have bags in the room before they arrive.</p>
  ${S.members.map((m: any, i: number) => `<div class="item">
    <div class="top"><h4>${esc(m.name || "Traveller " + (i + 1))}</h4><div style="display:flex;gap:10px;align-items:center"><span class="idchip">${m.id}</span>${S.members.length > 1 ? `<button class="x" type="button" data-act="rmMember" data-i="${i}">Remove</button>` : ""}</div></div>
    <div class="grid">
      ${inp(`members.${i}.name`, "Full name", { ph: "As on ID" })}
      ${inp(`members.${i}.phone`, "Mobile", { type: "tel", im: "numeric", opt: true, ph: "For their own bag updates" })}
      ${m.roomFromList ? inp(`members.${i}.room`, "Room", { ro: true, hint: "From the host's rooming list" + (m.note ? " · " + esc(m.note) : "") })
        : inp(`members.${i}.room`, "Room", { opt: true, ph: "Leave blank if not known", hint: m.room ? "" : "No room yet? We hold bags at the bell desk and move them when the room is assigned." })}
      ${sel(`members.${i}.mode`, "Travelling by", ["Flight", "Train", "Road"], { re: 1 })}
      ${sel(`members.${i}.arrDate`, "Arrives Udaipur", ["15 Dec", "16 Dec", "17 Dec", "18 Dec"])}
      ${inp(`members.${i}.arrTime`, "Arrival time", { type: "time", opt: true })}
      ${inp(`members.${i}.travelNo`, m.mode === "Flight" ? "Flight number" : m.mode === "Train" ? "Train number" : "Vehicle / notes", { opt: true, ph: m.mode === "Flight" ? "e.g. 6E 5203" : "" })}
      ${sel(`members.${i}.depDate`, "Leaves Udaipur", ["18 Dec", "19 Dec", "20 Dec", "21 Dec"])}
    </div>${err(`members.${i}.depDate`)}
  </div>`).join("")}
  <div class="adders" style="margin-top:14px"><button type="button" data-act="addMember">+ Add family member</button></div>`;
  }
  function rStep2() {
    return `<h3 class="ph">Where do we collect?</h3><p class="psub">Add one pickup point per address. Family members living apart can each have their own.</p>
  ${S.pickups.map((p: any, i: number) => { const w = WINDOWS[p.window]; return `<div class="item">
    <div class="top"><h4>${esc(p.label || "Pickup " + (i + 1))}</h4><div style="display:flex;gap:10px;align-items:center"><span class="idchip">${p.id}</span>${S.pickups.length > 1 ? `<button class="x" type="button" data-act="rmPickup" data-i="${i}">Remove</button>` : ""}</div></div>
    <div class="grid">
      ${inp(`pickups.${i}.label`, "Name this address", { opt: true, ph: "Home, Office, Nani's house" })}
      ${sel(`pickups.${i}.city`, "City", CITIES, { re: 1 })}
      ${showErrors && E[`pickups.${i}.city`] ? "" : (p.city === "Other city" ? `<div class="full callout warn">Pickups currently run in Mumbai, Thane and Navi Mumbai. Book anyway and our team will confirm what we can do on WhatsApp.</div>` : "")}
      ${inp(`pickups.${i}.address`, "Full address", { full: true, ph: "Flat / house no., building, street, area" })}
      ${inp(`pickups.${i}.pincode`, "Pincode", { im: "numeric", max: 6, ph: "400050" })}
      ${inp(`pickups.${i}.landmark`, "Landmark", { opt: true, ph: "Near…" })}
      ${sel(`pickups.${i}.lift`, "Access", ["Lift available", "Stairs only", "Ground floor / bungalow"])}
      ${inp(`pickups.${i}.contact`, "Person handing over", { opt: true, ph: "Defaults to you" })}
      ${inp(`pickups.${i}.contactPhone`, "Their mobile", { type: "tel", im: "numeric", opt: true })}
      <div class="f full"><span class="lab">Pickup window</span>
        <div class="seg" style="margin-top:7px">
          ${Object.entries(WINDOWS).map(([k, v]) => `<label><input type="radio" name="win${i}" data-b="pickups.${i}.window" data-re="1" value="${k}"${p.window === k ? " checked" : ""}><span>${v.label}</span></label>`).join("")}
        </div>
        <span class="hint">${p.window === "early" ? "Best for bulk luggage, gifts and décor." : "For outfits and things you need until you leave."} <span class="proto">Prototype: express window proposed</span></span>
      </div>
      ${sel(`pickups.${i}.date`, "Date", w.dates, { ph: "Choose date" })}
      ${sel(`pickups.${i}.slot`, "Time slot", SLOTS, { ph: "Select a slot" })}
      <div class="f full${bad(`pickups.${i}.members`)}"><span class="lab">Whose bags are collected here</span>
        <div class="seg" style="margin-top:7px">${S.members.map((m: any) => `<label><input type="checkbox" data-tg="pickups.${i}.members" value="${m.id}"${p.members.includes(m.id) ? " checked" : ""}><span>${esc(m.name || m.id)}</span></label>`).join("")}</div>
        ${err(`pickups.${i}.members`)}</div>
    </div>
  </div>`; }).join("")}
  <div class="adders" style="margin-top:14px"><button type="button" data-act="addPickup">+ Add another address</button></div>`;
  }
  function rStep3() {
    const ownersFor = () => S.members.map((m: any) => [m.id, m.name || m.id]);
    return `<h3 class="ph">Your bags</h3><p class="psub">Add each bag once. The colour and type print on its tag, so our team can match it at a glance among 300 others.</p>
  <div class="adders">${BAG_TYPES.map(([k, t]) => `<button type="button" data-act="addBag" data-t="${k}">+ ${t}</button>`).join("")}</div>
  ${showErrors && E.bags ? `<p class="msg">${E.bags}</p>` : ""}
  ${!S.bags.length ? `<div class="callout">No bags yet. Tap a bag type above to add your first one.</div>` : ""}
  ${S.bags.map((b: any, i: number) => { const t = BAG_TYPES.find((x) => x[0] === b.type); return `<div class="item">
    <div class="top"><h4>${esc(t ? t[1] : "Bag")}</h4><div style="display:flex;gap:10px;align-items:center"><span class="idchip">${esc(tagId(b))}</span><button class="x" type="button" data-act="dupBag" data-i="${i}">Duplicate</button><button class="x" type="button" data-act="rmBag" data-i="${i}">Remove</button></div></div>
    <div class="grid">
      ${sel(`bags.${i}.owner`, "Belongs to", ownersFor(), { ph: "Choose person", re: 1 })}
      ${sel(`bags.${i}.pickup`, "Collected from", S.pickups.map((p: any) => [p.id, (p.label || p.id) + (p.address ? " · " + p.address.slice(0, 28) : "")]), { ph: "Choose pickup", re: 1 })}
      <div class="f full${bad(`bags.${i}.colour`)}"><span class="lab">Colour${b.colour ? ` <em>· ${esc(b.colour)}</em>` : ""}</span>
        <div class="swatches" style="margin-top:7px">${COLOURS.map(([n, c]) => `<label title="${n}"><input type="radio" name="col${i}" data-b="bags.${i}.colour" data-re="1" value="${n}"${b.colour === n ? " checked" : ""}><i style="background:${c}"></i><span class="sr">${n}</span></label>`).join("")}</div>${err(`bags.${i}.colour`)}</div>
      ${inp(`bags.${i}.mark`, "Brand or identifying mark", { opt: true, ph: "e.g. American Tourister, red ribbon on handle" })}
      ${sel(`bags.${i}.weight`, "Approx. weight", WEIGHTS, { hint: b.weight === "Over 32 kg" ? "Bags over 32 kg need two handlers. We'll confirm on WhatsApp." : "" })}
      ${sel(`bags.${i}.contents`, "What's inside", CONTENTS, { re: 1 })}
      ${sel(`bags.${i}.deliverTo`, "Deliver to", DELIVER)}
      ${inp(`bags.${i}.value`, "Declared value (Rs.)", { type: "number", im: "numeric", opt: b.contents !== "Bridal / groom outfits", ph: "e.g. 50000" })}
      <div class="f"><span class="lab">Handling</span>
        <label class="tick"><input type="checkbox" data-b="bags.${i}.hang"${b.hang ? " checked" : ""}> Keep hanging (no folding)</label>
        <label class="tick"><input type="checkbox" data-b="bags.${i}.fragile"${b.fragile ? " checked" : ""}> Fragile</label>
      </div>
    </div>
  </div>`; }).join("")}`;
  }
  function rStep4() {
    return `<h3 class="ph">Bringing bags home</h3><p class="psub">Choose for each bag. Bags you're carrying back yourself can be left off.</p>
  ${!S.bags.length ? `<div class="callout">Add bags first.</div>` : `
  <div class="adders"><button type="button" data-act="retAll">Return all bags to their pickup address</button><button type="button" data-act="retNone">I'll carry everything back</button></div>
  <div>${S.bags.map((b: any, i: number) => `<div class="retrow">
    <div><label class="tick"><input type="checkbox" data-b="bags.${i}.ret" data-re="1"${b.ret ? " checked" : ""}> <span><b>${esc(memberName(b.owner))}</b> · ${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1] || "")}<br><span class="hint">${esc(b.colour || "")} · ${esc(tagId(b))}</span></span></label></div>
    ${b.ret ? `
    <select class="${bad(`bags.${i}.retDate`).trim()}" data-b="bags.${i}.retDate" aria-label="Return pickup date"><option value="">Pickup date</option>${RET_DATES.map((d) => `<option${b.retDate === d ? " selected" : ""}>${d}</option>`).join("")}</select>
    <select class="${bad(`bags.${i}.retSlot`).trim()}" data-b="bags.${i}.retSlot" aria-label="Return pickup time"><option value="">Time</option>${RET_SLOTS.map((d) => `<option${b.retSlot === d ? " selected" : ""}>${d}</option>`).join("")}</select>
    <select data-b="bags.${i}.retDest" data-re="1" aria-label="Deliver back to">${RET_DEST.map(([k, t]) => `<option value="${k}"${b.retDest === k ? " selected" : ""}>${t}</option>`).join("")}</select>
    ${b.retDest === "other" ? `<div class="full" style="grid-column:1/-1">${inp(`bags.${i}.retAddress`, "Return address", { ph: "Full address with pincode" })}</div>` : ""}
    ` : `<div class="hint" style="grid-column:span 3">Travelling back with the guest</div>`}
  </div>`).join("")}</div>
  <div class="grid" style="margin-top:20px">
    ${sel("extraReturn", "Extra bags expected on return", [["0", "None"], ["1", "1 more"], ["2", "2 more"], ["3", "3 more"], ["4", "4 or more"]], { hint: "Gifts and shopping. We'll bring extra tags to your room." })}
    ${sel("retSameRoom", "Collect return bags from", [["room", "Each guest's room"], ["bell", "Bell desk (we'll leave them there)"]])}
  </div>`}`;
  }
  function rStep5() {
    return `<h3 class="ph">Check and confirm</h3><p class="psub">You'll get this summary on WhatsApp, with an edit link.</p>
  <div class="lab" style="margin-bottom:8px">Travellers</div>
  <div class="tbl-wrap"><table><thead><tr><th>Guest</th><th>Room</th><th>Arrives</th><th>Leaves</th><th>Bags</th></tr></thead><tbody>
  ${S.members.map((m: any) => `<tr><td>${esc(m.name)}</td><td>${m.room ? esc(m.room) : '<span class="hint">Bell desk until assigned</span>'}</td><td>${esc(m.arrDate)} ${esc(m.arrTime)}${m.travelNo ? " · " + esc(m.travelNo) : ""}</td><td>${esc(m.depDate)}</td><td class="num">${S.bags.filter((b: any) => b.owner === m.id).length}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="lab" style="margin:20px 0 8px">Pickups</div>
  <div class="tbl-wrap"><table><thead><tr><th>Address</th><th>When</th><th>Bags</th></tr></thead><tbody>
  ${S.pickups.map((p: any) => `<tr><td><b>${esc(p.label || p.id)}</b><br>${esc(p.address)}, ${esc(p.city)} ${esc(p.pincode)}</td><td>${esc(p.date)}<br><span class="hint">${esc(p.slot)}</span></td><td class="num">${S.bags.filter((b: any) => b.pickup === p.id).length}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="lab" style="margin:20px 0 8px">Bags</div>
  <div class="tbl-wrap"><table><thead><tr><th>Tag</th><th>Bag</th><th>Owner</th><th>Deliver to</th><th>Return</th></tr></thead><tbody>
  ${S.bags.map((b: any) => `<tr><td style="font-family:var(--mono);font-size:12px">${esc(tagId(b))}</td><td>${esc(b.colour)} ${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1])}${b.hang ? " · hang" : ""}${b.fragile ? " · fragile" : ""}</td><td>${esc(memberName(b.owner))}</td><td>${esc((DELIVER.find((d) => d[0] === b.deliverTo) || [])[1])}${b.deliverTo === "room" && memberRoom(b.owner) ? " " + esc(memberRoom(b.owner)) : ""}</td><td>${b.ret ? esc(b.retDate) + "<br><span class='hint'>" + esc((RET_DEST.find((d) => d[0] === b.retDest) || [])[1]) + "</span>" : "<span class='hint'>With guest</span>"}</td></tr>`).join("")}
  </tbody></table></div>
  ${inp("notes", "Anything else we should know", { full: true, opt: true, ph: "Gate codes, building rules, elderly guests…" })}
  <div class="callout" style="margin-top:20px"><div><b>What we carry:</b> bridal and groom outfits, wedding gifts and hampers, décor materials, return gift boxes and family luggage. <b>We don't carry</b> jewellery, cash, other valuables, liquids that can leak, or anything flammable.</div></div>
  <div style="display:grid;gap:10px;margin-top:16px">
    <label class="tick"><input type="checkbox" data-b="decl.items"${S.decl.items ? " checked" : ""}> None of my bags contain jewellery, cash, valuables or restricted items.</label>
    <label class="tick"><input type="checkbox" data-b="decl.value"${S.decl.value ? " checked" : ""}> The declared values are correct. Undeclared items are covered up to the standard limit. <span class="proto">Prototype: limit to be set</span></label>
    <label class="tick"><input type="checkbox" data-b="decl.terms"${S.decl.terms ? " checked" : ""}> I agree to Bagdrop's terms of carriage.</label>
    <label class="tick"><input type="checkbox" data-b="decl.consent"${S.decl.consent ? " checked" : ""}> Bagdrop may use these addresses and travel details only to handle these bags, and delete them after the return delivery.</label>
    ${showErrors && Object.keys(E).some((k) => k.startsWith("decl.")) ? `<span class="msg">Tick all four to confirm.</span>` : ""}
  </div>`;
  }

  /* ---------- Render ---------- */
  function renderPanel() {
    const p = $("#panel")!;
    if (mode === "done") { p.innerHTML = rDone(); drawTagCodes(p); renderSummary(); return; }
    E = showErrors ? errs(step) : {};
    const body = [rStep0, rStep1, rStep2, rStep3, rStep4, rStep5][step]();
    p.innerHTML = `<ol class="stepper">${STEP_NAMES.map((n, i) => `<li class="${i < step ? "done" : i === step ? "cur" : ""}"><button type="button" data-go="${i}"${i > maxStep ? " disabled" : ""}><span>${i + 1}</span>${n}</button></li>`).join("")}</ol>
  <form id="wiz" novalidate>${body}
  <div class="navrow">${step > 0 ? `<button class="btn ghost" type="button" data-act="back">Back</button>` : "<span></span>"}
  ${step < 5 ? `<button class="btn" type="submit">Continue</button>` : `<button class="btn" type="submit">Confirm booking</button>`}</div></form>`;
    renderSummary();
  }
  function flagsFor(st: any) {
    const f: [string, string][] = [];
    const noRoom = st.members.filter((m: any) => !m.room).length;
    if (noRoom) f.push(["w", `${noRoom} guest${noRoom > 1 ? "s" : ""} without a room: bags held at bell desk`]);
    const hang = st.bags.filter((b: any) => b.hang).length; if (hang) f.push(["", `${hang} bag${hang > 1 ? "s" : ""} to keep hanging`]);
    const hv = st.bags.filter((b: any) => +b.value >= 50000).length; if (hv) f.push(["w", `${hv} high-value bag${hv > 1 ? "s" : ""} declared`]);
    const heavy = st.bags.filter((b: any) => b.weight === "Over 32 kg").length; if (heavy) f.push(["w", `${heavy} bag${heavy > 1 ? "s" : ""} over 32 kg`]);
    if (st.pickups.some((p: any) => p.city === "Other city")) f.push(["w", "Pickup outside Mumbai region"]);
    const early = st.pickups.some((p: any) => p.window === "early"); if (early && st.bags.some((b: any) => b.contents === "Bridal / groom outfits" && st.pickups.find((p: any) => p.id === b.pickup)?.window === "early")) f.push(["w", "Outfits on early pickup: away for 5+ days"]);
    return f;
  }
  function renderSummary() {
    const st = mode === "done" && booking ? booking.state : S;
    const rooms = [...new Set(st.members.map((m: any) => m.room).filter(Boolean))];
    const ret = st.bags.filter((b: any) => b.ret).length;
    const types: Record<string, number> = {}; st.bags.forEach((b: any) => { const t = (BAG_TYPES.find((x) => x[0] === b.type) || [])[1] as string; types[t] = (types[t] || 0) + 1; });
    const fl = flagsFor(st);
    $("#summary")!.innerHTML = `<div class="eyebrow">${mode === "done" ? "Booked" : "Your booking"}</div>
  <h4>${esc(st.family.familyName || st.family.lead || "New family booking")}</h4>
  ${st.family.side ? `<div><span class="pillside${st.family.side === "groom" ? " groom" : ""}">${st.family.side === "groom" ? "Groom's side" : "Bride's side"}</span></div>` : ""}
  <dl>
    <dt>Travellers</dt><dd>${st.members.filter((m: any) => m.name).length || st.members.length}</dd>
    <dt>Rooms</dt><dd>${rooms.length ? esc(rooms.join(", ")) : "—"}</dd>
    <dt>Pickup points</dt><dd>${st.pickups.length}</dd>
    <dt>Bags out</dt><dd>${st.bags.length}</dd>
    <dt>Bags back</dt><dd>${ret}${+st.extraReturn ? ` + ${st.extraReturn} extra` : ""}</dd>
  </dl>
  ${st.bags.length ? `<hr><dl>${Object.entries(types).map(([t, n]) => `<dt>${esc(t)}</dt><dd>${n}</dd>`).join("")}</dl>` : ""}
  ${fl.length ? `<hr><div class="flags">${fl.map(([c, t]) => `<div class="flag ${c}"><i></i>${esc(t)}</div>`).join("")}</div>` : `<hr><div class="flags"><div class="flag g"><i></i>Nothing needs attention</div></div>`}
  <hr><div class="mini" style="color:rgba(244,238,228,.6)">Charges are confirmed on WhatsApp before pickup. <span class="proto" style="color:var(--sand);border-color:var(--sand)">Pricing TBC</span></div>`;
  }

  /* ---------- Tags ---------- */
  function tagHTML(b: any, st: any, code: string) {
    const m = st.members.find((x: any) => x.id === b.owner) || {};
    const t = (BAG_TYPES.find((x) => x[0] === b.type) || [])[1] || "Bag";
    const dest = b.deliverTo === "room" ? (m.room || "Bell") : b.deliverTo === "host" ? "Host" : b.deliverTo === "decor" ? "Décor" : "Bell";
    const id = `${code}-${b.owner}-${b.id}`;
    return `<div class="ltag${st.family.side === "groom" ? " groom" : ""}"><span class="band"></span>
    <div class="row"><div style="min-width:0"><div class="id">${esc(id)}</div><div class="who">${esc(m.name || "Guest")}</div><div class="hint">${esc(st.family.familyName || st.family.lead || "")}</div></div>
    <div class="room"><small>${b.deliverTo === "room" && m.room ? "Room" : "To"}</small>${esc(dest)}</div></div>
    <div class="row" style="align-items:flex-end;margin-top:6px"><div class="meta"><span>${esc(b.colour || "")} ${esc(t)}</span>${b.hang ? '<span class="hot">Hang</span>' : ""}${b.fragile ? '<span class="hot">Fragile</span>' : ""}${+b.value > 0 ? '<span class="hot">Declared</span>' : ""}${b.ret ? `<span>Return ${esc((b.retDate || "").split(" (")[0])}</span>` : ""}</div>
    <canvas data-code="${esc(id)}" width="21" height="21" aria-label="Tag code preview"></canvas></div>
  </div>`;
  }
  /* Visual code preview only; printed tags carry a real scannable QR. */
  function drawTagCodes(root: HTMLElement) {
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-code]").forEach((c) => {
      const x = c.getContext("2d")!, n = 21; let h = hashNum(c.dataset.code!);
      x.fillStyle = "#FBF8F2"; x.fillRect(0, 0, n, n); x.fillStyle = "#2B2620";
      const finder = (a: number, b: number) => { x.fillRect(a, b, 7, 7); x.fillStyle = "#FBF8F2"; x.fillRect(a + 1, b + 1, 5, 5); x.fillStyle = "#2B2620"; x.fillRect(a + 2, b + 2, 3, 3); };
      finder(0, 0); finder(14, 0); finder(0, 14);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if ((i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12)) continue; h = (h * 1103515245 + 12345) >>> 0; if ((h >> 16) & 1) x.fillRect(i, j, 1, 1); }
    });
  }
  function rDone() {
    const st = booking.state, code = booking.bookingId;
    const wa = waText();
    return `<div class="conf-head"><div><div class="eyebrow">Booking confirmed</div><h3 class="ph" style="margin-top:6px">You're all set, ${esc((st.family.lead || "").split(" ")[0])}.</h3><div class="bid">${esc(code)}</div></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost sm" type="button" data-act="edit">Edit booking</button><a class="btn sm" href="#track">Track bags</a></div></div>
  ${booking.saved === false ? `<div class="callout warn" style="margin-bottom:16px">Saved in this browser only — the back end could not be reached. The booking syncs to Bagdrop ops when the connection returns.</div>` : ""}
  <div class="lab" style="margin-bottom:10px">Your ${st.bags.length} bag tag${st.bags.length > 1 ? "s" : ""} <em>· our agent brings these printed to your door</em></div>
  <div class="tags">${st.bags.map((b: any) => tagHTML(b, st, code)).join("")}</div>
  <div class="lab" style="margin:26px 0 10px">WhatsApp confirmation <em>· what the guest receives</em></div>
  <pre class="wa" id="waText">${esc(wa)}</pre>
  <div style="margin-top:10px"><button class="btn ghost sm" type="button" data-act="copyWa">Copy message</button></div>`;
  }
  function waText() {
    const st = booking.state, code = booking.bookingId;
    const lines = [`Bagdrop × #Y2K`, `Booking ${code} confirmed for ${st.family.familyName || st.family.lead}.`, ``];
    st.pickups.forEach((p: any) => { const n = st.bags.filter((b: any) => b.pickup === p.id).length; lines.push(`Pickup ${p.label || p.id}: ${p.date}, ${p.slot} · ${n} bag${n !== 1 ? "s" : ""}`); });
    lines.push("");
    st.members.forEach((m: any) => { const n = st.bags.filter((b: any) => b.owner === m.id).length; if (n) lines.push(`${m.name}: ${n} bag${n > 1 ? "s" : ""} → ${m.room ? "Room " + m.room : "bell desk until room is assigned"}`); });
    const r = st.bags.filter((b: any) => b.ret).length; lines.push("", `Return: ${r} bag${r !== 1 ? "s" : ""} from Taj Aravali${+st.extraReturn ? ` (+${st.extraReturn} extra expected)` : ""}.`);
    lines.push("", "Our agent brings printed tags and seals each bag at your door. Edit until 24 hours before pickup.");
    return lines.join("\n");
  }

  /* ---------- Track ---------- */
  function renderTrack() {
    const box = $("#trackBox")!;
    if (!booking) { box.innerHTML = `<div class="callout">Once you book, every bag shows here with its tag and where it is right now. <a href="#book" style="margin-left:4px"><b>Book your pickup</b></a></div>`; return; }
    const st = booking.state, code = booking.bookingId, bs = booking.bagStatus || {};
    box.innerHTML = `<p class="lede" style="margin-top:0">${esc(code)} · ${esc(st.family.familyName || st.family.lead)}</p>` +
    st.bags.map((b: any) => { const id = `${code}-${b.owner}-${b.id}`; const s = bs[id] || "Booked"; const k = STAGES.indexOf(s);
      const stages = b.ret ? STAGES : STAGES.slice(0, 6);
      return `<div class="trk"><div class="top"><div><b>${esc(memberName2(st, b.owner))}</b> · ${esc(b.colour)} ${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1])}<div class="hint" style="font-family:var(--mono)">${esc(id)}</div></div><span class="state">${esc(s)}</span></div>
   <div class="tline" style="grid-template-columns:repeat(${stages.length},1fr)">${stages.map((_, i) => `<div class="${i <= k ? "on" : ""}"></div>`).join("")}</div>
   <div class="tlabels" style="grid-template-columns:repeat(${stages.length},1fr)">${stages.map((x) => `<span>${x}</span>`).join("")}</div></div>`; }).join("");
  }
  function memberName2(st: any, id: string) { const m = st.members.find((x: any) => x.id === id); return m ? m.name : id; }

  /* ---------- Ops ---------- */
  function renderOps() {
    const sec = $("#ops")!; if (!isEditor) { sec.hidden = true; return; } sec.hidden = false;
    if (opsLocked) {
      $("#opsNote")!.innerHTML = `Sign in to the <a href="/admin"><b>Admin OS</b></a> in this browser first, then reload this page — the manifest reads through the admin session.`;
      $("#opsKpis")!.innerHTML = "";
      $("#opsList")!.innerHTML = "";
      return;
    }
    const docs = opsDocs;
    $("#opsNote")!.textContent = docs.length ? `${docs.length} family booking${docs.length > 1 ? "s" : ""}, live.` : "No bookings yet. They appear here as guests book.";
    let g = 0, bo = 0, br = 0, hang = 0, noRoom = 0;
    docs.forEach((d: any) => { const s = d.state; g += s.members.length; bo += s.bags.length; br += s.bags.filter((b: any) => b.ret).length + (+s.extraReturn || 0); hang += s.bags.filter((b: any) => b.hang).length; noRoom += s.members.filter((m: any) => !m.room).length; });
    $("#opsKpis")!.innerHTML = ([["Families", docs.length], ["Guests", g], ["Bags out", bo], ["Bags back", br], ["Hanging", hang], ["No room yet", noRoom]] as [string, number][]).map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");
    const f = (document.querySelector('input[name=opsf]:checked') as HTMLInputElement | null)?.value || "all";
    const list = docs.filter((d: any) => f === "all" || (f === "flag" ? flagsFor(d.state).some((x) => x[0] === "w") : d.state.family.side === f));
    $("#opsList")!.innerHTML = list.length ? list.map((d: any) => { const s = d.state, fl = flagsFor(s).filter((x) => x[0] === "w"); return `<details class="fam"><summary>
    <span style="font-family:var(--mono);font-size:12px">${esc(d.bookingId)}</span><span><b>${esc(s.family.familyName || s.family.lead)}</b><br><span class="mini">${esc(s.family.phone)} · ${esc(s.pickups.map((p: any) => p.date).join(", "))}</span></span>
    <span><span class="pillside${s.family.side === "groom" ? " groom" : ""}">${s.family.side === "groom" ? "Groom" : "Bride"}</span></span><span class="num">${s.members.length}</span><span class="num">${s.bags.length}</span>
    <span class="mini">${fl.length ? esc(fl.map((x) => x[1]).join(" · ")) : "—"}</span></summary>
    <div class="tbl-wrap" style="margin-bottom:14px"><table><thead><tr><th>Tag</th><th>Bag</th><th>Owner · room</th><th>Pickup</th><th>Status</th></tr></thead><tbody>
    ${s.bags.map((b: any) => { const id = `${d.bookingId}-${b.owner}-${b.id}`; const m = s.members.find((x: any) => x.id === b.owner) || {}; const p = s.pickups.find((x: any) => x.id === b.pickup) || {}; const cur = (d.bagStatus || {})[id] || "Booked";
      return `<tr><td style="font-family:var(--mono);font-size:12px">${esc(id)}</td><td>${esc(b.colour)} ${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1])}${b.hang ? " · hang" : ""}${+b.value > 0 ? " · Rs." + esc(b.value) : ""}</td><td>${esc(m.name)} · ${m.room ? esc(m.room) : "<b>no room</b>"}</td><td>${esc(p.date)} ${esc((p.slot || "").split(" ·")[0])}<br><span class="mini">${esc(p.pincode)}</span></td>
      <td><select class="mini-sel" data-ops="${esc(d._id)}" data-tag="${esc(id)}" aria-label="Status">${STAGES.map((x) => `<option${x === cur ? " selected" : ""}>${x}</option>`).join("")}</select></td></tr>`; }).join("")}
    </tbody></table></div></details>`; }).join("") : `<p class="mini" style="padding:14px 0">Nothing in this view.</p>`;
  }

  /* ---------- Events ---------- */
  document.addEventListener("input", (e) => {
    const t = e.target as any; if (!t.dataset) return;
    if (t.dataset.b) {
      let v = t.type === "checkbox" ? t.checked : t.value;
      if (t.type === "tel") v = v.replace(/[^\d+]/g, "");
      setPath(S, t.dataset.b, v);
      onChange(t.dataset.b, v);
      if (t.dataset.re || t.type === "radio" || (t.tagName === "SELECT" && t.dataset.re)) { renderPanel(); refocus(t); }
      else renderSummary();
    } else if (t.dataset.tg) {
      const arr = getPath(S, t.dataset.tg); const i = arr.indexOf(t.value);
      if (t.checked && i < 0) arr.push(t.value); if (!t.checked && i >= 0) arr.splice(i, 1); renderSummary();
    }
  }, { signal });
  document.addEventListener("change", (e) => {
    const t = e.target as any;
    if (t.name === "opsf") renderOps();
    if (t.dataset && t.dataset.ops) void updateStatus(t.dataset.ops, t.dataset.tag, t.value);
  }, { signal });
  function refocus(t: any) { const id = t.id; if (id) { const n = document.getElementById(id); if (n && n !== t && t.type !== "radio") n.focus(); } }
  function onChange(path: string, v: any) {
    /* Smart defaults */
    const m = path.match(/^bags\.(\d+)\.contents$/);
    if (m) { const b = S.bags[+m[1]]; if (v === "Bridal / groom outfits") { b.hang = true; } if (v === "Wedding gifts & hampers" || v === "Return gift boxes") { b.deliverTo = "host"; } if (v === "Décor material") { b.deliverTo = "decor"; } }
    const o = path.match(/^bags\.(\d+)\.owner$/);
    if (o) { const b = S.bags[+o[1]]; const p = S.pickups.find((p: any) => p.members.includes(v)); if (p && !b.pickup) b.pickup = p.id; }
    const w = path.match(/^pickups\.(\d+)\.window$/); if (w) { S.pickups[+w[1]].date = ""; }
  }
  document.addEventListener("click", (e) => {
    const go = (e.target as HTMLElement).closest("[data-go]") as HTMLButtonElement | null; if (go && !go.disabled) { step = +go.dataset.go!; showErrors = false; renderPanel(); scrollPanel(); return; }
    const a = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null; if (!a) return;
    const i = +(a.dataset.i ?? -1), act = a.dataset.act;
    if (act === "addMember") { S.seq.g++; S.members.push(blankMember(S.seq.g)); }
    if (act === "rmMember") { const id = S.members[i].id; S.members.splice(i, 1); S.pickups.forEach((p: any) => p.members = p.members.filter((x: string) => x !== id)); S.bags.forEach((b: any) => { if (b.owner === id) b.owner = ""; }); }
    if (act === "addPickup") { S.seq.p++; const p = blankPickup(S.seq.p); S.pickups.push(p); }
    if (act === "rmPickup") { const id = S.pickups[i].id; S.pickups.splice(i, 1); S.bags.forEach((b: any) => { if (b.pickup === id) b.pickup = ""; }); }
    if (act === "addBag") { S.seq.b++; const owner = S.members.length === 1 ? S.members[0].id : ""; const pk = S.pickups.length === 1 ? S.pickups[0].id : (owner ? (S.pickups.find((p: any) => p.members.includes(owner)) || {}).id || "" : "");
      const t = a.dataset.t!;
      S.bags.push({ id: "B" + pad(S.seq.b), type: t, owner, pickup: pk, colour: "", mark: "", weight: t === "large" || t === "trunk" ? "20–32 kg" : t === "cabin" || t === "garment" ? "Under 10 kg" : "10–20 kg",
        contents: t === "garment" ? "Bridal / groom outfits" : t === "gift" ? "Wedding gifts & hampers" : t === "decor" ? "Décor material" : "Family luggage",
        deliverTo: t === "gift" ? "host" : t === "decor" ? "decor" : "room", value: "", hang: t === "garment", fragile: t === "gift" || t === "decor", ret: t !== "gift" && t !== "decor", retDate: "19 Dec", retSlot: "At checkout time", retDest: "same", retAddress: "" }); }
    if (act === "dupBag") { S.seq.b++; const c = JSON.parse(JSON.stringify(S.bags[i])); c.id = "B" + pad(S.seq.b); S.bags.splice(i + 1, 0, c); }
    if (act === "rmBag") { S.bags.splice(i, 1); }
    if (act === "retAll") { S.bags.forEach((b: any) => { b.ret = true; b.retDest = "same"; b.retDate = b.retDate || "19 Dec"; b.retSlot = b.retSlot || "At checkout time"; }); }
    if (act === "retNone") { S.bags.forEach((b: any) => b.ret = false); }
    if (act === "back") { step--; showErrors = false; renderPanel(); scrollPanel(); return; }
    if (act === "edit") { S = JSON.parse(JSON.stringify(booking.state)); mode = "form"; step = 5; maxStep = 5; renderPanel(); scrollPanel(); return; }
    if (act === "copyWa") { const txt = $("#waText")!.textContent || ""; try { navigator.clipboard.writeText(txt).then(() => toast("Message copied"), () => selectWa()); } catch { selectWa(); } return; }
    renderPanel();
  }, { signal });
  function selectWa() { const r = document.createRange(); r.selectNodeContents($("#waText")!); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); toast("Selected. Press copy on your keyboard."); }
  function scrollPanel() { $("#book")!.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  document.addEventListener("submit", (e) => {
    if ((e.target as HTMLElement).id !== "wiz") return; e.preventDefault();
    if (!stepValid(step)) { showErrors = true; renderPanel(); const b = $("#panel .bad, #panel .msg"); if (b) b.scrollIntoView({ block: "center" }); return; }
    showErrors = false;
    if (step < 5) { step++; maxStep = Math.max(maxStep, step); renderPanel(); scrollPanel(); } else void confirmBooking();
  }, { signal });

  /* ---------- Save ---------- */
  async function confirmBooking() {
    const btn = $('#wiz button[type=submit]') as HTMLButtonElement | null; if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    const code = booking ? booking.bookingId : ("Y2K-F" + String(hashNum(S.family.phone || "x") % 9000 + 1000));
    if (!S.family.familyName) S.family.familyName = (S.family.lead.split(" ").slice(-1)[0] || "") + " family";
    const doc = { bookingId: code, state: JSON.parse(JSON.stringify(S)), bagStatus: (booking && booking.bagStatus) || {}, updatedAt: new Date().toISOString(), createdAt: (booking && booking.createdAt) || new Date().toISOString() };
    let saved = false;
    try {
      const prev = await getBookingDoc(code).catch(() => null);
      await saveWeddingBooking(adminDoc(doc, prev) as Booking);
      saved = true; watchMine(code);
    } catch { saved = false; }
    booking = Object.assign(doc, { saved });
    try { localStorage.setItem("y2k-booking", JSON.stringify(booking)); } catch {}
    mode = "done"; renderPanel(); renderTrack(); scrollPanel();
    toast(saved ? "Booking saved — Bagdrop ops has it live" : "Saved in this browser");
  }
  /* One document, two views: the Admin OS record carries the full wedding-desk
     state under .wedding, so the inbox, events module and this page stay in sync. */
  function isoDate(d: any) { const p = String(d || "").match(/(\d{1,2})\s*Dec/); return p ? ("2026-12-" + String(p[1]).padStart(2, "0")) : "2026-12-16"; }
  function adminDoc(doc: any, prev: any) {
    const st = doc.state, over = st.bags.filter((b: any) => b.weight === "Over 32 kg").length;
    const first = st.pickups[0] || {};
    prev = prev || {};
    return {
      id: doc.bookingId, created: doc.createdAt, status: prev.status || "submitted",
      eventCode: EVENT_CODE, eventName: "Yashna & Yash wedding",
      uc: "wed", ucName: "Wedding · #Y2K", mode: "road",
      from: first.city || "Mumbai", to: "Udaipur",
      pickAddr: (first.address || "") + (first.pincode ? ", " + first.pincode : ""),
      dropAddr: "Taj Aravali Resort, Udaipur",
      zo: "MUM", zd: "NOR", date: isoDate(first.date), ref: EVENT_CODE, slot: first.slot || "",
      bags: st.bags.length - over, oversize: over, billed: Math.max(st.bags.length, 1),
      traveller: { name: st.family.lead, mobile: st.family.phone, email: st.family.email, res: "in" },
      family: { name: st.family.familyName, side: st.family.side, guests: st.members.length },
      payer: { name: "Host account · #Y2K", contact: "" },
      note: st.notes || "", source: "wedding desk · #Y2K",
      quote: { qid: null, total: 0, breakdown: { internal: true, hostBilled: true } },
      identity: { ok: true, at: doc.updatedAt, method: "Declarations signed on the wedding desk", score: 0.9 },
      pay: null, admin: prev.admin || {},
      events: (prev.events || []).concat([{ at: doc.updatedAt, by: "customer",
        text: (prev.id ? "Booking updated on the wedding desk" : "Family booked on the #Y2K wedding desk") +
        " · " + st.members.length + " guests · " + st.bags.length + " bags · " + st.pickups.length + " pickup point(s)" }]),
      wedding: { bookingId: doc.bookingId, state: doc.state, bagStatus: doc.bagStatus, createdAt: doc.createdAt, updatedAt: doc.updatedAt },
    };
  }
  let unsubMine: (() => void) | null = null;
  function watchMine(code: string) {
    if (unsubMine) unsubMine();
    unsubMine = watchBookingDoc(code, (d: any) => {
      if (d && d.wedding && booking) { booking.bagStatus = d.wedding.bagStatus || {}; renderTrack(); }
    });
    unsubs.push(unsubMine);
  }
  async function updateStatus(docId: string, tag: string, val: string) {
    try {
      const d: any = opsRaw[docId] ?? (await getBookingDoc(docId)); if (!d || !d.wedding) return;
      d.wedding.bagStatus[tag] = val; d.wedding.updatedAt = new Date().toISOString();
      d.events = (d.events || []).concat([{ at: d.wedding.updatedAt, by: "admin", text: "Bag " + tag.split("-").slice(-1)[0] + " → " + val + " (Y2K ops desk)" }]);
      const k = STAGES.indexOf(val);
      /* Booked, Picked up, At hub, In transit, At Taj, In room, Return pickup, Delivered home */
      if (k >= 1 && k <= 2 && ["submitted", "accepted", "assigned"].includes(d.status)) d.status = "picked_up";
      if (k === 3 || k === 4 || k === 6) d.status = "in_transit";
      if (k === 5 || k === 7) d.status = "delivered";
      await adminSaveBooking(d);
      toast(tag.split("-").slice(-1)[0] + " → " + val);
    } catch { toast("Couldn't update. Check your access."); }
  }

  /* ---------- Countdown ---------- */
  function tick() { let d = Math.max(0, WEDDING.getTime() - Date.now()); const D = Math.floor(d / 864e5); d -= D * 864e5; const h = Math.floor(d / 36e5); d -= h * 36e5; const m = Math.floor(d / 6e4); const s = Math.floor((d - m * 6e4) / 1e3);
    $("#cd-d")!.textContent = String(D); $("#cd-h")!.textContent = pad(h); $("#cd-m")!.textContent = pad(m); $("#cd-s")!.textContent = pad(s); }
  tick(); timers.push(setInterval(tick, 1000));

  /* ---------- Nav: solid background past the hero, hamburger drawer ---------- */
  function onScroll() {
    const nav = $("#siteNav"); if (!nav) return;
    if (window.scrollY > 80) nav.classList.add("scrolled"); else nav.classList.remove("scrolled");
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { signal, passive: true });
  function openDrawer() { $("#navDrawer")?.classList.add("open"); $("#navBackdrop")?.classList.add("open"); }
  function closeDrawer() { $("#navDrawer")?.classList.remove("open"); $("#navBackdrop")?.classList.remove("open"); }
  $("#navOpen")?.addEventListener("click", openDrawer, { signal });
  $("#navClose")?.addEventListener("click", closeDrawer, { signal });
  $("#navBackdrop")?.addEventListener("click", closeDrawer, { signal });
  document.querySelectorAll("[data-nav-link]").forEach((a) => a.addEventListener("click", closeDrawer, { signal }));

  /* ---------- Fade-up reveal as sections scroll into view ---------- */
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => { entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revealObserver?.unobserve(en.target); } }); }, { threshold: 0.15 })
    : null;
  document.querySelectorAll(".reveal").forEach((el) => (revealObserver ? revealObserver.observe(el) : el.classList.add("in")));
  if (revealObserver) unsubs.push(() => revealObserver.disconnect());

  /* ---------- Boot ---------- */
  try { const raw = localStorage.getItem("y2k-booking"); if (raw) { booking = JSON.parse(raw); mode = "done"; } } catch {}
  renderPanel(); renderTrack();

  if (booking) watchMine(booking.bookingId);
  /* ops desk: opened from the admin console with ?ops=1 — the manifest reads
     through the cookie-gated admin API, so sign in at /admin first. */
  isEditor = new URLSearchParams(location.search).get("ops") === "1";
  if (isEditor) {
    const opsTick = async () => {
      try {
        const list = await adminListBookings();
        opsLocked = false;
        opsRaw = {};
        list.forEach((x: any) => { if (x.eventCode === EVENT_CODE && x.wedding) opsRaw[x.id] = x; });
        opsDocs = Object.values(opsRaw).map((x: any) => Object.assign({ _id: x.id }, x.wedding));
        opsDocs.sort((a: any, b: any) => String(a.bookingId).localeCompare(b.bookingId));
      } catch {
        opsLocked = true;
      }
      renderOps();
    };
    void opsTick();
    timers.push(setInterval(() => void opsTick(), 5000));
    renderOps();
  }

  return () => {
    ac.abort();
    timers.forEach(clearInterval);
    unsubs.forEach((f) => f());
    clearTimeout(toastT);
  };
}
