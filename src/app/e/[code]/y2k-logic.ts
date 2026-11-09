"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/** Y2K wedding desk logic (family wizard, tag preview, tracker, ops desk,
 *  countdown, nav). The booking wizard (steps, validation, tags, tracker,
 *  ops) is unchanged; the marketing chrome around it — nav, hero, banner,
 *  celebration, destination, travel — was redesigned to match the live
 *  bagdrop.co/y2k page: real photography replaces the old canvas mountain
 *  art (so the ridges()/drawArt() canvas painters and their resize listener
 *  are gone), the travel section's tag-demo preview is gone (that page has
 *  a luggage photo there instead). The booking form (2026-11-03) is two
 *  tabs — Booking (you, your pickup address, your bags, then family members
 *  with their own bags) and Return (tick the bags that come back; they keep
 *  the same tag code) — then a Confirm view. Data layer:
 *   - DB.put("bookings", ...)    -> saveWeddingBooking (server route; event
 *                                   must be open; create only, guests cannot
 *                                   edit a saved booking)
 *   - DB.watchDoc(...)           -> watchBookingDoc (polls /api/wedding/mine)
 *   - ops desk DB.watch(...)     -> the cookie-gated /api/admin/bookings
 *                                   route via adminApi (sign in at /admin
 *                                   first, then open /e/y2k?ops=1)
 *   - the event-seed on load moved to the Admin OS Weddings module.
 */
import { adminListBookings, adminSaveBooking } from "@/lib/adminApi";
import { saveWeddingBooking, watchBookingDoc } from "@/lib/eventDb";
import type { Booking } from "@/lib/types";
import { getEvent } from "@/lib/eventDb";
import { bookingOpen, closesText } from "@/lib/weddingStatus";
import { withBase } from "@/lib/basePath";

export function initY2k(): () => void {
  const ac = new AbortController();
  const signal = ac.signal;
  const timers: ReturnType<typeof setInterval>[] = [];
  const unsubs: (() => void)[] = [];

  /* ---------- Constants ---------- */
  const WEDDING = new Date("2026-12-17T00:00:00+05:30");
  const STAGES = ["Booked", "Picked up", "At hub", "In transit", "At Taj", "In room", "Return pickup", "Delivered home"];
  const TAB_NAMES = ["Booking", "Return"];
  /* the two sizes guests book; the older keys stay so earlier bookings still read on tags and tracking */
  const BAG_TYPES: [string, string][] = [["small", "Small bag"], ["large", "Large bag"],
    ["medium", "Medium suitcase"], ["cabin", "Cabin bag"], ["garment", "Garment bag"], ["trunk", "Trunk / duffel"], ["gift", "Gift / hamper box"], ["decor", "Décor crate"]];
  const WEIGHTS: Record<string, string[]> = { small: ["Under 10 kg", "10–15 kg"], large: ["15–23 kg", "23–32 kg"] };
  const COLOURS = ["Black", "Navy", "Grey", "Silver", "Red", "Maroon", "Green", "Blue", "Brown", "Beige", "Pink", "White"];
  const OTHER = "Other";
  // one pickup window: 9, 10 and 11 December
  const PICK_DATES = ["9 Dec", "10 Dec", "11 Dec"];
  const SLOTS = ["Morning · 10 AM–1 PM", "Midday · 1–3 PM", "Afternoon · 3–6 PM"];
  // guests leave Udaipur on 18 or 19 December; return pickups follow the same two days
  const RET_DATES = ["18 Dec", "19 Dec"];
  const RET_SLOTS = ["Before 9 AM", "9 AM–12 PM", "12–3 PM", "At checkout time"];
  const RET_DEST: [string, string][] = [["same", "Same as pickup address"], ["other", "A different address"]];
  const LIFTS = ["Lift available", "No lift (stairs)"];
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


  /* ---------- State ----------
   * Saved as wedding.state, the same shape BAGDROP OS, the printed tags and
   * My bags read: members (G01…), pickups (P1…, each listing whose bags it
   * collects) and bags (B01…, owner + pickup). The lead's pickup is P1; a
   * member who is collected elsewhere gets a pickup of their own. */
  function blankMember(n: number) { return { id: "G" + pad(n), name: "", phone: "", room: "", roomFromList: false, note: "", depDate: "19 Dec", ownAddr: false }; }
  function blankPickup(n: number) { return { id: "P" + n, label: n === 1 ? "Home" : "", city: "Mumbai", address: "", pincode: "", landmark: "", lift: "Lift available", contact: "", contactPhone: "", window: "early", date: "", slot: "", members: [] as string[] }; }
  function blankBag(n: number, type: string, owner: string, pickup: string) {
    return { id: "B" + pad(n), type, owner, pickup, colour: "", colourPick: "", mark: "", weight: WEIGHTS[type]?.[type === "large" ? 1 : 0] ?? "", contents: "Family luggage",
      deliverTo: "room", value: "", hang: false, fragile: false, ret: false, retDate: "", retSlot: "", retDest: "same", retAddress: "" };
  }
  function fresh(): any {
    const p1 = blankPickup(1); p1.members = ["G01"];
    return { family: { phone: "", lead: "", email: "", side: "", familyName: "" },
      members: [blankMember(1)], pickups: [p1], bags: [] as any[], extraReturn: "0", retSameRoom: "room", notes: "",
      ret: { date: "", slot: "", dest: "same", address: "" },
      decl: { items: false, value: false, terms: false, consent: false }, seq: { g: 1, p: 1, b: 0 } };
  }
  let S: any = fresh();
  let tab = 0, showErrors = false, review = false;
  let booking: any = null;     /* saved booking document (the desk's own view) */
  let mode = "form";           /* form | done */
  let isEditor = false;
  let opsDocs: any[] = [];
  let opsRaw: Record<string, Booking> = {};
  let opsBusy = false; // a stage change is saving: the 5-second refresh waits
  let opsRefresh: () => Promise<void> = async () => {};
  let opsLocked = false;


  /* ---------- Validation ---------- */
  const pickupOf = (m: any) => S.pickups.find((p: any) => p.members.includes(m.id)) || S.pickups[0];
  const leadReady = () => !!S.family.lead.trim() && phoneOk(S.family.phone);
  function errs(t: number) {
    const e: Record<string, string> = {};
    if (t === 0) {
      if (!S.family.lead.trim()) e["family.lead"] = "Enter your name.";
      if (!phoneOk(S.family.phone)) e["family.phone"] = "Enter a 10-digit Indian mobile number.";
      if (S.family.email && !/^\S+@\S+\.\S+$/.test(S.family.email)) e["family.email"] = "Check the email address.";
      if (!S.family.side) e["family.side"] = "Choose bride's side or groom's side.";
      S.pickups.forEach((p: any, i: number) => {
        if (!p.members.length) return; // an address nobody is collected from is skipped
        if (p.city === "Other city") e[`pickups.${i}.city`] = "We pick up in Mumbai, Thane and Navi Mumbai. Book anyway and we'll confirm on WhatsApp.";
        if (!p.address.trim()) e[`pickups.${i}.address`] = "Add the full address.";
        if (!/^\d{6}$/.test(p.pincode)) e[`pickups.${i}.pincode`] = "6-digit pincode.";
        if (!p.date) e[`pickups.${i}.date`] = "Choose a date.";
        if (!p.slot) e[`pickups.${i}.slot`] = "Choose a time.";
      });
      S.members.forEach((m: any, i: number) => { if (i > 0 && !m.name.trim()) e[`members.${i}.name`] = "Add their name."; });
      if (!S.bags.length) e["bags"] = "Add at least one bag.";
      S.bags.forEach((b: any, i: number) => {
        if (!b.type) e[`bags.${i}.type`] = "Small or large?";
        if (b.colourPick === OTHER && !b.colour.trim()) e[`bags.${i}.colour`] = "Type the colour.";
        if (b.value && !(+b.value >= 0)) e[`bags.${i}.value`] = "Amount in rupees.";
      });
    }
    if (t === 1 && S.bags.some((b: any) => b.ret)) {
      if (!S.ret.date) e["ret.date"] = "Choose 18 or 19 December.";
      if (!S.ret.slot) e["ret.slot"] = "Choose a time.";
      if (S.ret.dest === "other" && !S.ret.address.trim()) e["ret.address"] = "Add the return address with pincode.";
    }
    if (t === 2) { for (const k of ["items", "value", "terms", "consent"]) if (!S.decl[k]) e["decl." + k] = "Required"; }
    return e;
  }
  const softErr = (k: string) => k.endsWith(".city");
  function tabValid(t: number) { const e = errs(t); return Object.keys(e).filter((k) => !softErr(k)).length === 0; }

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
  function tagId(b: any) { const fam = bookingCode(); return `${fam}-${b.owner || "G??"}-${b.id}`; }
  function bookingCode() { return booking ? booking.bookingId : ("Y2K-F" + String(hashNum(S.family.phone || "x") % 9000 + 1000)); }


  /* ---------- Tabs ---------- */
  function sideSeg() {
    return `<div class="f full${bad("family.side")}"><span class="lab">Which side are you with?</span>
    <div class="seg" style="margin-top:7px">${[["bride", "Bride's side"], ["groom", "Groom's side"]].map(([v, t]) => `<label><input type="radio" name="side" data-b="family.side" data-re="1" value="${v}"${S.family.side === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>${err("family.side")}</div>`;
  }
  function addressBlock(pi: number, who: string) {
    const p = S.pickups[pi];
    return `<div class="grid">
      ${inp(`pickups.${pi}.address`, `${who} address`, { full: true, ph: "Flat, building, street, area", ac: "street-address" })}
      ${sel(`pickups.${pi}.city`, "City", CITIES)}
      ${inp(`pickups.${pi}.pincode`, "Pincode", { im: "numeric", max: 6, ac: "postal-code" })}
      ${sel(`pickups.${pi}.lift`, "Lift in the building", LIFTS, { hint: p.lift === LIFTS[1] ? "Our agent carries the bags down. Tell us the floor in the note if it is above the 3rd." : "" })}
      ${inp(`pickups.${pi}.landmark`, "Landmark", { opt: true, ph: "Near…" })}
      ${sel(`pickups.${pi}.date`, "Pickup date", PICK_DATES, { ph: "Choose a date" })}
      ${sel(`pickups.${pi}.slot`, "Pickup time", SLOTS, { ph: "Choose a time" })}
    </div>`;
  }
  function bagCard(b: any, i: number) {
    const sizes = BAG_TYPES.slice(0, 2);
    return `<div class="item bag"${bad(`bags.${i}.type`) ? ' style="border-color:var(--err)"' : ""}>
    <div class="top"><h4>Bag ${i + 1}</h4><div style="display:flex;gap:10px;align-items:center"><span class="idchip">${esc(tagId(b))}</span><button class="x" type="button" data-act="rmBag" data-i="${i}">Remove</button></div></div>
    <div class="f full"><span class="lab">Size</span>
      <div class="seg" style="margin-top:7px">${sizes.map(([k, t]) => `<label><input type="radio" name="size${i}" data-b="bags.${i}.type" data-re="1" value="${k}"${b.type === k ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>${err(`bags.${i}.type`)}</div>
    <div class="grid">
      ${sel(`bags.${i}.weight`, "Weight", WEIGHTS[b.type] ?? WEIGHTS.small)}
      ${sel(`bags.${i}.colourPick`, "Colour", [...COLOURS, OTHER], { opt: true, ph: "Choose a colour", re: 1 })}
      ${b.colourPick === OTHER ? inp(`bags.${i}.colour`, "Which colour?", { ph: "e.g. Teal with brown trim" }) : ""}
      ${inp(`bags.${i}.mark`, "Brand", { opt: true, ph: "e.g. American Tourister" })}
      ${inp(`bags.${i}.value`, "Declared value (Rs.)", { type: "number", im: "numeric", opt: true, ph: "For insurance, if you wish" })}
    </div></div>`;
  }
  function bagsFor(owner: string) {
    const list = S.bags.map((b: any, i: number) => [b, i]).filter(([b]: any) => b.owner === owner);
    return `${list.map(([b, i]: any) => bagCard(b, i)).join("")}
    <div class="adders" style="margin:${list.length ? 14 : 4}px 0 0"><button type="button" data-act="addBag" data-o="${owner}">+ Add a bag</button></div>`;
  }
  function rBooking() {
    const ready = leadReady();
    return `<h3 class="ph">Book your pickup</h3><p class="psub">Your details once, then a bag at a time. Family members with bags go below — no need to repeat your number.</p>
  <div class="grid">
    ${inp("family.lead", "Your name", { ph: "Full name", ac: "name" })}
    ${inp("family.phone", "Mobile", { type: "tel", im: "numeric", ph: "10-digit number", ac: "tel", hint: "Every update about these bags comes to this number on WhatsApp." })}
    ${inp("family.email", "Email", { type: "email", opt: true, ph: "name@example.com", ac: "email" })}
    ${sideSeg()}
  </div>
  <div style="margin-top:26px">${addressBlock(0, "Pickup")}</div>
  <div class="lab" style="margin:26px 0 10px">Your bags</div>
  ${showErrors && E.bags ? `<p class="msg">${E.bags}</p>` : ""}
  ${bagsFor("G01")}
  <div class="lab" style="margin:30px 0 10px">Family members with bags <em>· optional</em></div>
  ${S.members.slice(1).map((m: any, k: number) => { const i = k + 1, pi = S.pickups.indexOf(pickupOf(m)); return `<div class="item member">
    <div class="top"><h4>${esc(m.name || `Member ${i}`)}</h4><button class="x" type="button" data-act="rmMember" data-i="${i}">Remove</button></div>
    <div class="grid">${inp(`members.${i}.name`, "Name", { ph: "Full name" })}
      <label class="tick" style="align-self:end;padding-bottom:12px"><input type="checkbox" data-act-toggle="ownAddr" data-i="${i}"${m.ownAddr ? " checked" : ""}> Collected from a different address</label></div>
    ${m.ownAddr && pi > 0 ? addressBlock(pi, "Their") : ""}
    <div class="lab">${esc((m.name || "Their").split(" ")[0])}${m.name ? "'s" : ""} bags</div>
    ${bagsFor(m.id)}
  </div>`; }).join("")}
  ${ready ? `<div class="adders"><button type="button" data-act="addMember">+ Add a family member</button></div>` : `<div class="callout">Fill in your name and mobile first, then add the family members whose bags we collect.</div>`}
  <div style="margin-top:26px">${inp("notes", "Anything we should know", { full: true, opt: true, ph: "Floor, gate instructions, a bag that needs extra care…" })}</div>`;
  }
  function rReturn() {
    const p1 = S.pickups[0];
    const on = S.bags.filter((b: any) => b.ret).length;
    return `<h3 class="ph">Bringing bags home</h3><p class="psub">Tick the bags that come back from Udaipur. They keep the same tag code for the return, so nothing is re-labelled.</p>
  ${!S.bags.length ? `<div class="callout">Add your bags on the Booking tab first.</div>` : `
  <div class="adders"><button type="button" data-act="retAll">Return all ${S.bags.length} bags</button><button type="button" data-act="retNone">I'll carry everything back</button></div>
  <div class="retlist">${S.bags.map((b: any, i: number) => `<label class="tick retline"><input type="checkbox" data-b="bags.${i}.ret" data-re="1"${b.ret ? " checked" : ""}>
    <span><b>${esc(memberName(b.owner))}</b> · ${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1] || "Bag")}${b.colour ? " · " + esc(b.colour) : ""}${b.mark ? " · " + esc(b.mark) : ""}<br><span class="hint" style="font-family:var(--mono)">${esc(tagId(b))}</span></span></label>`).join("")}</div>
  ${on ? `<div class="lab" style="margin:26px 0 10px">Return pickup at the hotel</div>
  <div class="grid">
    ${sel("ret.date", "Pickup date", RET_DATES, { ph: "18 or 19 December" })}
    ${sel("ret.slot", "Pickup time", RET_SLOTS, { ph: "Choose a time" })}
    ${sel("ret.dest", "Deliver back to", RET_DEST, { re: 1, full: true, hint: S.ret.dest === "same" ? esc([p1.address, p1.city, p1.pincode].filter(Boolean).join(", ") || "Your pickup address from the Booking tab") : "" })}
    ${S.ret.dest === "other" ? inp("ret.address", "Return address", { full: true, ph: "Full address with pincode" }) : ""}
    ${sel("extraReturn", "Extra bags on the way back", [["0", "None"], ["1", "1 more"], ["2", "2 more"], ["3", "3 more"], ["4", "4 or more"]], { hint: "Gifts and shopping. We bring extra tags to your room." })}
  </div>` : `<div class="callout">No return booked. ${S.bags.length} bag${S.bags.length > 1 ? "s" : ""} travel one way; you carry them back yourself.</div>`}`}`;
  }
  function rReview() {
    const ret = S.bags.filter((b: any) => b.ret);
    return `<h3 class="ph">Check and confirm</h3><p class="psub">Everything our agent needs at your door. Go back to either tab to change anything.</p>
  <div class="lab" style="margin:0 0 8px">Booking</div>
  <div class="tbl-wrap"><table><thead><tr><th>Who</th><th>Collected from</th><th>Bags</th></tr></thead><tbody>
  ${S.members.map((m: any) => { const p = pickupOf(m); return `<tr><td>${esc(m.name)}${m.id === "G01" ? ` <span class="hint">${esc(S.family.phone)}</span>` : ""}</td><td>${esc(p.address)}, ${esc(p.city)} ${esc(p.pincode)}<br><span class="hint">${esc(p.date)} · ${esc(p.slot)} · ${esc(p.lift)}</span></td><td class="num">${S.bags.filter((b: any) => b.owner === m.id).length}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="lab" style="margin:20px 0 8px">Bags</div>
  <div class="tbl-wrap"><table><thead><tr><th>Tag</th><th>Bag</th><th>Owner</th><th>Return</th></tr></thead><tbody>
  ${S.bags.map((b: any) => `<tr><td style="font-family:var(--mono);font-size:12px">${esc(tagId(b))}</td><td>${esc((BAG_TYPES.find((x) => x[0] === b.type) || [])[1])} · ${esc(b.weight)}${b.colour ? " · " + esc(b.colour) : ""}${b.mark ? " · " + esc(b.mark) : ""}${+b.value > 0 ? " · Rs. " + esc(b.value) : ""}</td><td>${esc(memberName(b.owner))}</td><td>${b.ret ? esc(S.ret.date) + "<br><span class='hint'>" + esc(S.ret.dest === "other" ? S.ret.address : "Same address") + "</span>" : "<span class='hint'>With guest</span>"}</td></tr>`).join("")}
  </tbody></table></div>
  ${ret.length ? `<p class="hint" style="margin-top:8px">${ret.length} bag${ret.length > 1 ? "s" : ""} return on ${esc(S.ret.date)}, ${esc(S.ret.slot)}, with the same tags.</p>` : ""}
  <div class="lab" style="margin:26px 0 10px">Declarations</div>
  <div style="display:grid;gap:12px">
    <label class="tick${bad("decl.items")}"><input type="checkbox" data-b="decl.items"${S.decl.items ? " checked" : ""}> None of my bags contain jewellery, cash, valuables or restricted items.</label>
    <label class="tick${bad("decl.value")}"><input type="checkbox" data-b="decl.value"${S.decl.value ? " checked" : ""}> The declared values, where given, are accurate.</label>
    <label class="tick${bad("decl.terms")}"><input type="checkbox" data-b="decl.terms"${S.decl.terms ? " checked" : ""}> I agree to Bagdrop's terms of carriage.</label>
    <label class="tick${bad("decl.consent")}"><input type="checkbox" data-b="decl.consent"${S.decl.consent ? " checked" : ""}> Bagdrop may use these addresses and details only to handle these bags, and delete them after the return delivery.</label>
  </div>${showErrors && Object.keys(E).some((k) => k.startsWith("decl.")) ? `<p class="msg" style="margin-top:10px">Please tick all four to confirm.</p>` : ""}`;
  }
  /* ---------- Render ---------- */
  function renderPanel() {
    const p = $("#panel")!;
    const sum = $("#summary"); if (sum) sum.hidden = closed && mode !== "done";
    if (closed && mode !== "done") { p.innerHTML = rClosed(); return; }
    if (mode === "done") { p.innerHTML = rDone(); drawTagCodes(p); renderSummary(); return; }
    E = showErrors ? errs(review ? 2 : tab) : {};
    const body = review ? rReview() : [rBooking, rReturn][tab]();
    const retN = S.bags.filter((b: any) => b.ret).length;
    p.innerHTML = `<div class="tabs" role="tablist">${TAB_NAMES.map((n, i) => `<button type="button" role="tab" data-tab="${i}" class="${!review && i === tab ? "cur" : ""}" aria-selected="${!review && i === tab}">${n}${i === 1 && retN ? ` <span class="num">${retN}</span>` : ""}</button>`).join("")}<button type="button" role="tab" data-tab="2" class="${review ? "cur" : ""}" aria-selected="${review}">Confirm</button></div>
  <form id="wiz" novalidate>${body}
  <div class="navrow">${review ? `<button class="btn ghost" type="button" data-tab="1">Back</button><button class="btn" type="submit">Confirm booking</button>`
    : tab === 0 ? `<span></span><button class="btn" type="submit">Next: Return</button>`
    : `<button class="btn ghost" type="button" data-tab="0">Back</button><button class="btn" type="submit">Review and confirm</button>`}</div></form>`;
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
    
    return f;
  }
  function renderSummary() {
    const st = mode === "done" && booking ? booking.state : S;
    const ret = st.bags.filter((b: any) => b.ret).length;
    const types: Record<string, number> = {}; st.bags.forEach((b: any) => { const t = (BAG_TYPES.find((x) => x[0] === b.type) || [])[1] as string; types[t] = (types[t] || 0) + 1; });
    const fl = flagsFor(st).filter((x) => !/without a room/.test(x[1])); // rooms are the hosts' job, not the guest's
    const retDate = st.ret?.date || st.bags.find((b: any) => b.ret)?.retDate || "";
    $("#summary")!.innerHTML = `<div class="eyebrow">${mode === "done" ? "Booked" : "Your booking"}</div>
  <h4>${esc(st.family.familyName || st.family.lead || "New family booking")}</h4>
  ${st.family.side ? `<div><span class="pillside${st.family.side === "groom" ? " groom" : ""}">${st.family.side === "groom" ? "Groom's side" : "Bride's side"}</span></div>` : ""}
  <dl>
    <dt>People</dt><dd>${st.members.filter((m: any) => m.name).length || st.members.length}</dd>
    <dt>Pickup addresses</dt><dd>${st.pickups.filter((p: any) => p.members?.length).length}</dd>
    <dt>Bags out</dt><dd>${st.bags.length}</dd>
    <dt>Bags back</dt><dd>${ret}${+st.extraReturn ? ` + ${st.extraReturn} extra` : ""}</dd>
    ${ret && retDate ? `<dt>Return pickup</dt><dd>${esc(retDate)}</dd>` : ""}
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
  /* where the team is with this booking (polled from /api/wedding/mine): the desk never says "confirmed" before Bagdrop does */
  function teamState(): "waiting" | "confirmed" | "closed" {
    const s = booking?.teamStatus;
    if (!s || ["quoted", "identified", "submitted", "revised"].includes(s)) return "waiting";
    return ["rejected", "cancelled"].includes(s) ? "closed" : "confirmed";
  }
  function teamNote() {
    const t = teamState();
    if (t === "confirmed") return `<div class="callout" style="margin-bottom:16px"><b>Confirmed by Bagdrop.</b> The hosts are covering this, so there is nothing to pay.</div>`;
    if (t === "closed") return `<div class="callout warn" style="margin-bottom:16px">This booking is closed. Message Bagdrop on WhatsApp if this is a mistake.</div>`;
    return `<div class="callout" style="margin-bottom:16px"><b>Request received.</b> Bagdrop is reviewing it and will WhatsApp you the moment it is confirmed.</div>`;
  }
  /* bookings shut on the event's bookingCloses date (15 Nov for #Y2K): no new
     booking, no added bags, no new return trip; the team changes bookings in BAGDROP OS */
  let closed = false, closesOn = "";
  function rClosed() {
    return `<div class="conf-head"><div><div class="eyebrow">Bookings closed</div><h3 class="ph" style="margin-top:6px">Luggage bookings for #Y2K closed${closesOn ? ` on ${esc(closesOn)}` : ""}.</h3></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn sm" href="${withBase("/e/y2k/my")}">My bags</a></div></div>
  <div class="callout">No new bookings, extra bags or return trips can be added now. Already booked? See your bags and tags in My bags. For anything else, message Bagdrop on WhatsApp.</div>`;
  }
  function rDone() {
    const st = booking.state, code = booking.bookingId;
    const wa = waText();
    return `<div class="conf-head"><div><div class="eyebrow">${teamState() === "confirmed" ? "Booking confirmed" : teamState() === "closed" ? "Booking closed" : "Request received"}</div><h3 class="ph" style="margin-top:6px">You're all set, ${esc((st.family.lead || "").split(" ")[0])}.</h3><div class="bid">${esc(code)}</div></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">${closed ? "" : `<button class="btn ghost sm" type="button" data-act="newBooking">New booking</button>`}<a class="btn sm" href="#track">Track bags</a><a class="btn ghost sm" href="${withBase("/e/y2k/my")}">My bags</a></div></div>
  ${teamNote()}
  ${booking.saved === false ? `<div class="callout warn" style="margin-bottom:16px">Saved in this browser only — the back end could not be reached. The booking syncs to Bagdrop ops when the connection returns.</div>` : ""}
  <div class="lab" style="margin-bottom:10px">Your ${st.bags.length} bag tag${st.bags.length > 1 ? "s" : ""} <em>· our agent brings these printed to your door</em></div>
  <div class="tags">${st.bags.map((b: any) => tagHTML(b, st, code)).join("")}</div>
  <div class="lab" style="margin:26px 0 10px">WhatsApp confirmation <em>· what the guest receives</em></div>
  <pre class="wa" id="waText">${esc(wa)}</pre>
  <div style="margin-top:10px"><button class="btn ghost sm" type="button" data-act="copyWa">Copy message</button></div>`;
  }
  function waText() {
    const st = booking.state, code = booking.bookingId;
    const lines = [`Bagdrop × #Y2K`, `Booking ${code} ${teamState() === "confirmed" ? "confirmed" : "received, awaiting Bagdrop confirmation,"} for ${st.family.familyName || st.family.lead}.`, ``];
    st.pickups.forEach((p: any) => { const n = st.bags.filter((b: any) => b.pickup === p.id).length; lines.push(`Pickup ${p.label || p.id}: ${p.date}, ${p.slot} · ${n} bag${n !== 1 ? "s" : ""}`); });
    lines.push("");
    st.members.forEach((m: any) => { const n = st.bags.filter((b: any) => b.owner === m.id).length; if (n) lines.push(`${m.name}: ${n} bag${n > 1 ? "s" : ""} → ${m.room ? "Room " + m.room : "bell desk until room is assigned"}`); });
    const r = st.bags.filter((b: any) => b.ret).length; lines.push("", `Return: ${r} bag${r !== 1 ? "s" : ""} from Taj Aravali${+st.extraReturn ? ` (+${st.extraReturn} extra expected)` : ""}.`);
    lines.push("", "Our agent brings printed tags and seals each bag at your door. Returning bags keep the same tag.");
    return lines.join("\n");
  }

  /* ---------- Track ---------- */
  function renderTrack() {
    const box = $("#trackBox")!;
    if (!booking) { box.innerHTML = `<div class="callout">Once you book, every bag shows here with its tag and where it is right now. <a href="#book" style="margin-left:4px"><b>Book your pickup</b></a></div>`; return; }
    const st = booking.state, code = booking.bookingId, bs = booking.bagStatus || {};
    box.innerHTML = `<p class="lede" style="margin-top:0">${esc(code)} · ${esc(st.family.familyName || st.family.lead)}</p>` + teamNote() +
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
      $("#opsNote")!.innerHTML = `Sign in to the <a href="${withBase("/admin")}"><b>BAGDROP OS</b></a> in this browser first, then reload this page — the manifest reads through the admin session.`;
      $("#opsKpis")!.innerHTML = "";
      $("#opsList")!.innerHTML = "";
      return;
    }
    const docs = opsDocs;
    $("#opsNote")!.textContent = docs.length ? `${docs.length} family booking${docs.length > 1 ? "s" : ""}, live.` : "No bookings yet. They appear here as guests book.";
    let g = 0, bo = 0, br = 0, hang = 0, noRoom = 0;
    docs.forEach((d: any) => { const s = d.state; g += s.members.length; bo += s.bags.length; br += s.bags.filter((b: any) => b.ret).length + (+s.extraReturn || 0); hang += s.bags.filter((b: any) => b.hang).length; noRoom += s.members.filter((m: any) => !m.room).length; });
    $("#opsKpis")!.innerHTML = ([["Families", docs.length], ["Guests", g], ["Bags out", bo], ["Bags back", br], ["Hanging", hang], ["No room yet", noRoom]] as [string, number][]).map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");
    const openIds = new Set([...document.querySelectorAll<HTMLElement>("#opsList details[open]")].map((x) => x.dataset.id));
    const f = (document.querySelector('input[name=opsf]:checked') as HTMLInputElement | null)?.value || "all";
    const list = docs.filter((d: any) => f === "all" || (f === "flag" ? flagsFor(d.state).some((x) => x[0] === "w") : d.state.family.side === f));
    $("#opsList")!.innerHTML = list.length ? list.map((d: any) => { const s = d.state, fl = flagsFor(s).filter((x) => x[0] === "w"); return `<details class="fam" data-id="${esc(d._id)}"${openIds.has(d._id) ? " open" : ""}><summary>
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
      if (t.dataset.re || t.type === "radio") { renderPanel(); refocus(t); }
      else if (/^(family\.(lead|phone)|members\.\d+\.name)$/.test(t.dataset.b)) { renderSummary(); liveLabel(t.dataset.b); }
      else renderSummary();
    }
  }, { signal });
  document.addEventListener("change", (e) => {
    const t = e.target as any;
    if (t.name === "opsf") renderOps();
    if (t.dataset && t.dataset.ops) { opsBusy = true; t.blur(); void updateStatus(t.dataset.ops, t.dataset.tag, t.value); }
    if (t.dataset && t.dataset.actToggle === "ownAddr") { toggleOwnAddr(+t.dataset.i, t.checked); renderPanel(); }
    /* the add-member button appears once the lead's name and mobile are in */
    if (t.dataset && (t.dataset.b === "family.lead" || t.dataset.b === "family.phone")) renderPanel();
  }, { signal });
  function refocus(t: any) { const id = t.id; if (id) { const n = document.getElementById(id); if (n && n !== t && t.type !== "radio") n.focus(); } }
  /* a member's name is echoed in their card heading and bag list without a full redraw (which would steal focus) */
  function liveLabel(path: string) {
    const m = path.match(/^members\.(\d+)\.name$/); if (!m) return;
    const card = document.querySelectorAll("#panel .item.member")[+m[1] - 1]; if (!card) return;
    const name = S.members[+m[1]].name;
    const h = card.querySelector("h4"); if (h) h.textContent = name || `Member ${m[1]}`;
    const l = card.querySelector(":scope > .lab"); if (l) l.textContent = `${(name || "Their").split(" ")[0]}${name ? "'s" : ""} bags`;
  }
  function onChange(path: string, v: any) {
    /* the person booking is member G01: their name and mobile are typed once, at the top */
    if (path === "family.lead") S.members[0].name = v;
    if (path === "family.phone") S.members[0].phone = v;
    const c = path.match(/^bags\.(\d+)\.colourPick$/);
    if (c) { const b = S.bags[+c[1]]; b.colour = v === OTHER ? "" : v; }
    const t = path.match(/^bags\.(\d+)\.type$/);
    if (t) { const b = S.bags[+t[1]]; if (!WEIGHTS[v]?.includes(b.weight)) b.weight = WEIGHTS[v]?.[v === "large" ? 1 : 0] ?? ""; }
    const r = path.match(/^bags\.(\d+)\.ret$/);
    if (r && v) { const b = S.bags[+r[1]]; b.retDest = S.ret.dest; }
    if (path.startsWith("ret.")) syncReturn();
  }
  /* the family's one return choice is written onto every returning bag, the shape the tags and OS read */
  function syncReturn() { S.bags.forEach((b: any) => { if (!b.ret) return; b.retDate = S.ret.date; b.retSlot = S.ret.slot; b.retDest = S.ret.dest; b.retAddress = S.ret.dest === "other" ? S.ret.address : ""; }); }
  function toggleOwnAddr(i: number, on: boolean) {
    const m = S.members[i]; m.ownAddr = on;
    S.pickups.forEach((p: any) => { p.members = p.members.filter((x: string) => x !== m.id); });
    let p: any;
    if (on) { S.seq.p++; p = blankPickup(S.seq.p); p.label = m.name || p.id; S.pickups.push(p); }
    else p = S.pickups[0];
    p.members.push(m.id);
    S.pickups = S.pickups.filter((x: any, k: number) => k === 0 || x.members.length); // drop an address nobody uses
    S.bags.forEach((b: any) => { if (b.owner === m.id) b.pickup = p.id; });
  }
  document.addEventListener("click", (e) => {
    const tb = (e.target as HTMLElement).closest("[data-tab]") as HTMLButtonElement | null;
    if (tb) { const n = +tb.dataset.tab!; if (n === 2) { if (!tabValid(0) || !tabValid(1)) { showErrors = true; tab = tabValid(0) ? 1 : 0; review = false; renderPanel(); scrollFirstBad(); return; } review = true; } else { review = false; tab = n; } showErrors = false; renderPanel(); scrollPanel(); return; }
    const a = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null; if (!a) return;
    const i = +(a.dataset.i ?? -1), act = a.dataset.act;
    if (act === "addMember") { S.seq.g++; const m = blankMember(S.seq.g); S.members.push(m); S.pickups[0].members.push(m.id); }
    if (act === "rmMember") { const id = S.members[i].id; S.members.splice(i, 1); S.pickups.forEach((p: any) => p.members = p.members.filter((x: string) => x !== id)); S.pickups = S.pickups.filter((x: any, k: number) => k === 0 || x.members.length); S.bags = S.bags.filter((b: any) => b.owner !== id); }
    if (act === "addBag") { S.seq.b++; const owner = a.dataset.o!; const m = S.members.find((x: any) => x.id === owner); const pk = (m ? pickupOf(m) : S.pickups[0]).id;
      const last = [...S.bags].reverse().find((b: any) => b.owner === owner);
      S.bags.push(blankBag(S.seq.b, last ? last.type : "large", owner, pk)); }
    if (act === "rmBag") { S.bags.splice(i, 1); }
    if (act === "retAll") { S.bags.forEach((b: any) => { b.ret = true; }); if (!S.ret.date) S.ret.date = "19 Dec"; if (!S.ret.slot) S.ret.slot = "At checkout time"; syncReturn(); }
    if (act === "retNone") { S.bags.forEach((b: any) => { b.ret = false; b.retDate = ""; b.retSlot = ""; }); }
    // guests cannot edit a saved booking; they start a new one (the team changes bookings in BAGDROP OS)
    if (act === "newBooking" && closed) { toast("Bookings are closed"); return; }
    if (act === "newBooking") { booking = null; try { localStorage.removeItem("y2k-booking"); } catch {} S = fresh(); mode = "form"; tab = 0; review = false; showErrors = false; renderPanel(); renderTrack(); scrollPanel(); return; }
    if (act === "copyWa") { const txt = $("#waText")!.textContent || ""; try { navigator.clipboard.writeText(txt).then(() => toast("Message copied"), () => selectWa()); } catch { selectWa(); } return; }
    renderPanel();
    if (act === "addBag" || act === "addMember") { const items = document.querySelectorAll(act === "addBag" ? "#panel .item.bag" : "#panel .item.member"); const el = items[items.length - 1]; if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); (el.querySelector("input:not([type=radio]),select") as HTMLElement | null)?.focus(); } }
  }, { signal });
  function selectWa() { const r = document.createRange(); r.selectNodeContents($("#waText")!); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); toast("Selected. Press copy on your keyboard."); }
  function scrollPanel() { $("#book")!.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  function scrollFirstBad() { const b = $("#panel .bad, #panel .msg"); if (b) b.scrollIntoView({ block: "center" }); }
  document.addEventListener("submit", (e) => {
    if ((e.target as HTMLElement).id !== "wiz") return; e.preventDefault();
    const t = review ? 2 : tab;
    if (!tabValid(t)) { showErrors = true; renderPanel(); scrollFirstBad(); return; }
    showErrors = false; syncReturn();
    if (review) { void confirmBooking(); return; }
    if (tab === 0) { tab = 1; } else { review = true; }
    renderPanel(); scrollPanel();
  }, { signal });
  /* ---------- Save ---------- */
  async function confirmBooking() {
    const btn = $('#wiz button[type=submit]') as HTMLButtonElement | null; if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    if (!S.family.familyName) S.family.familyName = (S.family.lead.split(" ").slice(-1)[0] || "") + " family";
    /* every save is a NEW booking with its own random code (it used to come from the mobile, so a
       second family on the same phone overwrote the first); a taken code is refused, so retry */
    const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const newCode = () => "Y2K-F" + Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) => ALPHA[n % ALPHA.length]).join("");
    const now = new Date().toISOString();
    let doc: any = null, saved = false, lastErr = "";
    for (let tries = 0; tries < 4 && !saved; tries++) {
      doc = { bookingId: newCode(), state: JSON.parse(JSON.stringify(S)), bagStatus: {}, updatedAt: now, createdAt: now };
      try { await saveWeddingBooking(adminDoc(doc, null) as Booking); saved = true; watchMine(doc.bookingId); }
      catch (e) { lastErr = e instanceof Error ? e.message : ""; if (lastErr !== "ALREADY_BOOKED") break; }
    }
    if (!saved && (lastErr === "BOOKING_CLOSED" || lastErr === "EVENT_NOT_OPEN")) { closed = true; applyClosed(); toast("Bookings are closed"); return; }
    booking = Object.assign(doc, { saved });
    try { localStorage.setItem("y2k-booking", JSON.stringify(booking)); } catch {}
    mode = "done"; renderPanel(); renderTrack(); scrollPanel();
    toast(saved ? "Booking saved — Bagdrop ops has it live" : "Saved in this browser");
  }
  /* One document, two views: the Admin OS record carries the full wedding-desk
     state under .wedding, so the inbox, events module and this page stay in sync. */
  function isoDate(d: any) { const p = String(d || "").match(/(\d{1,2})\s*Dec/); return p ? ("2026-12-" + String(p[1]).padStart(2, "0")) : "2026-12-09"; }
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
    unsubMine = watchBookingDoc(code, booking?.state?.family?.phone ?? "", (d: any) => {
      if (d && booking) {
        if (d.wedding) booking.bagStatus = d.wedding.bagStatus || {};
        const changed = booking.teamStatus !== d.status;
        booking.teamStatus = d.status;
        renderTrack();
        if (changed && mode === "done") renderPanel();
      }
    });
    unsubs.push(unsubMine);
  }
  async function updateStatus(docId: string, tag: string, val: string, override = false): Promise<void> {
    const bag = tag.split("-").slice(-1)[0];
    try {
      const d0: any = opsRaw[docId] ?? (await adminListBookings()).find((x) => x.id === docId); if (!d0 || !d0.wedding) { toast("Couldn't find that booking. Reload the page."); return; }
      const d: any = JSON.parse(JSON.stringify(d0));
      d.wedding.bagStatus = { ...(d.wedding.bagStatus || {}), [tag]: val }; d.wedding.updatedAt = new Date().toISOString();
      d.events = (d.events || []).concat([{ at: d.wedding.updatedAt, by: "admin", text: "Bag " + bag + " → " + val + " (Y2K ops desk)" + (override ? " · Aadhaar override" : "") }]);
      const k = STAGES.indexOf(val);
      /* Booked, Picked up, At hub, In transit, At Taj, In room, Return pickup, Delivered home */
      if (k >= 1 && k <= 2 && ["submitted", "accepted", "assigned"].includes(d.status)) d.status = "picked_up";
      if (k === 3 || k === 4 || k === 6) d.status = "in_transit";
      if (k === 5 || k === 7) d.status = "delivered";
      const saved: any = await adminSaveBooking(d, { overrideIdentityGate: override });
      opsRaw[docId] = saved;
      opsDocs = opsDocs.map((x: any) => x._id === docId ? { ...x, bagStatus: saved.wedding.bagStatus } : x);
      toast(bag + " → " + val);
    } catch (e: any) {
      if (e?.code === "IDENTITY_NOT_VERIFIED") {
        if (confirm(`${tag}: Aadhaar is not verified for this family yet.\n\nMark it "${val}" anyway? The override is recorded on the booking.`)) return updateStatus(docId, tag, val, true);
        toast(bag + " kept as it was. Aadhaar pending.");
      } else if (e?.code === "STALE") toast("That booking changed elsewhere. Refreshed, try again.");
      else toast("Couldn't update: " + (e?.message || "check your access."));
      await opsRefresh();
    } finally { opsBusy = false; renderOps(); }
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

  /* ---------- Floating "Book now": shown once the hero (with its own button) is gone, hidden at the form ---------- */
  const fab = $("#bookFab"), bookSec = $("#book"), heroSec = $("#top");
  if (fab && bookSec && heroSec && "IntersectionObserver" in window) {
    let heroIn = true, bookIn = false;
    const fabIo = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.target === heroSec) heroIn = en.isIntersecting; else bookIn = en.isIntersecting; });
      fab.classList.toggle("off", heroIn || bookIn);
    }, { threshold: 0.05 });
    fabIo.observe(heroSec); fabIo.observe(bookSec);
    unsubs.push(() => fabIo.disconnect());
  } else fab?.classList.remove("off");

  function applyClosed() {
    renderPanel();
    if (closed) { fab?.remove(); document.querySelectorAll<HTMLAnchorElement>('a[href="#book"]').forEach((a) => { a.textContent = "Bookings closed"; a.setAttribute("href", withBase("/e/y2k/my")); }); }
  }
  getEvent(EVENT_CODE).then((ev) => {
    closesOn = closesText(ev);
    closed = !ev || ev.status !== "open" || !bookingOpen(ev);
    const lede = $("#bookLede"); if (lede && closesOn) lede.textContent = `One request for your whole family. Pickups run 9–11 December 2026 from Mumbai. Bookings ${closed ? "closed on" : "close"} ${closesOn}.`;
    applyClosed();
  }).catch(() => { /* the server still refuses a late booking */ });

  /* ---------- Boot ---------- */
  // ?new=1 (from the guest dashboard): start a fresh family booking instead of reopening the saved one
  if (new URLSearchParams(location.search).has("new")) { try { localStorage.removeItem("y2k-booking"); } catch {} }
  try { const raw = localStorage.getItem("y2k-booking"); if (raw) { booking = JSON.parse(raw); mode = "done"; } } catch {}
  renderPanel(); renderTrack();
  // the panel is drawn after load, so the jump to #book / #track lands short; redo it
  if (location.hash === "#book" || location.hash === "#track") setTimeout(() => $(location.hash)?.scrollIntoView({ block: "start" }), 60);

  if (booking) watchMine(booking.bookingId);
  /* ops desk: opened from the admin console with ?ops=1 — the manifest reads
     through the cookie-gated admin API, so sign in at /admin first. */
  isEditor = new URLSearchParams(location.search).get("ops") === "1";
  if (isEditor) {
    const opsTick = async () => {
      if (opsBusy || (document.activeElement as HTMLElement | null)?.closest?.("#opsList select")) return;
      try {
        const list = await adminListBookings();
        opsLocked = false;
        opsRaw = {};
        list.forEach((x: any) => { if (x.eventCode === EVENT_CODE && x.wedding) opsRaw[x.id] = x; });
        // a half-saved booking may lack members/bags/pickups: default them so one bad row can't blank the whole manifest
        opsDocs = Object.values(opsRaw).map((x: any) => { const w = Object.assign({ _id: x.id }, x.wedding); const st = w.state || {};
          w.state = { ...st, family: st.family || {}, members: st.members || [], bags: st.bags || [], pickups: st.pickups || [] }; w.bookingId = w.bookingId || x.id; return w; });
        opsDocs.sort((a: any, b: any) => String(a.bookingId).localeCompare(b.bookingId));
      } catch {
        opsLocked = true;
      }
      renderOps();
    };
    opsRefresh = async () => { opsBusy = false; await opsTick(); };
    void opsTick();
    timers.push(setInterval(() => void opsTick(), 5000));
    renderOps();
    // unhidden just above, but the guest sections render after load too, so
    // the jump lands short without this — same fix as #book/#track.
    setTimeout(() => $("#ops")?.scrollIntoView({ block: "start" }), 60);
  }

  return () => {
    ac.abort();
    timers.forEach(clearInterval);
    unsubs.forEach((f) => f());
    clearTimeout(toastT);
  };
}
