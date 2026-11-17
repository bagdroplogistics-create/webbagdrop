/** Internal "new wedding booking" email for the inquiry desk — a proper
 *  layout with every detail the team needs (family, contacts, pickups, guests,
 *  bags, return, notes) instead of the 5-line plain text. Pure: no fetches.
 *  Reads the booking's wedding.state loosely (older bookings vary). */
import type { Booking } from "./types";

interface St {
  family?: { lead?: string; phone?: string; email?: string; side?: string; familyName?: string; notes?: string };
  members?: { id: string; name?: string; phone?: string; room?: string }[];
  pickups?: { id: string; city?: string; address?: string; pincode?: string; landmark?: string; lift?: string; date?: string; slot?: string }[];
  bags?: { id: string; type?: string; owner?: string; pickup?: string; colour?: string; weight?: string; value?: string; ret?: boolean; retDate?: string; retSlot?: string; retDest?: string; retAddress?: string; deliverTo?: string; room?: string }[];
  ret?: { date?: string; slot?: string; dest?: string; address?: string };
  extraReturn?: number | string;
  notes?: string;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

function prettyDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
const slotText = (s: string) => ({ morning: "Morning · 10 AM–1 PM", midday: "Midday · 1–3 PM", afternoon: "Afternoon · 1–3 PM", evening: "Evening · 3–6 PM" } as Record<string, string>)[s.toLowerCase()] ?? s;
const intl = (m: string) => { const d = m.replace(/\D/g, ""); return d ? (m.trim().startsWith("+") ? "+" + d : d.length === 10 ? "+91" + d : "+" + d) : ""; };

export function buildWeddingBookingEmail(doc: Booking, adminUrl: string): { text: string; html: string; subject: string } {
  const st = ((doc.wedding as { state?: St } | undefined)?.state ?? {}) as St;
  const familyName = S(doc.family?.name) || S(st.family?.familyName) || S(doc.traveller?.name) || doc.id;
  const side = S(doc.family?.side) || S(st.family?.side);
  const sideLabel = side ? `${side.charAt(0).toUpperCase()}${side.slice(1)}'s side` : "";
  const lead = S(st.family?.lead) || S(doc.traveller?.name);
  const phone = intl(S(doc.traveller?.mobile) || S(st.family?.phone));
  const email = S(doc.traveller?.email) || S(st.family?.email);
  const members = st.members ?? [];
  const pickups = st.pickups?.length ? st.pickups : [{ id: "P1", city: doc.from, address: doc.pickAddr, date: doc.date, slot: doc.slot }];
  const bags = st.bags ?? [];
  const retBags = bags.filter((b) => b.ret);
  const note = [S(doc.note), S(st.notes)].filter((x, i, a) => x && a.indexOf(x) === i).join(" — ");
  const memberName = (id?: string) => S(members.find((m) => m.id === id)?.name) || S(id);
  const pickupLabel = (id?: string) => { const i = pickups.findIndex((p) => p.id === id); return i >= 0 ? `Pickup ${i + 1}` : ""; };
  const total = bags.length || Number(doc.bags) || 0;
  const created = doc.created ? new Date(doc.created).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST" : "";
  const subject = `New Y2K wedding booking · ${doc.id} · ${familyName}`;

  /* ---------- plain-text fallback ---------- */
  const tl: string[] = [
    `NEW Y2K WEDDING BOOKING · ${doc.id}`,
    `${familyName}${sideLabel ? ` · ${sideLabel}` : ""}`,
    `Lead guest: ${lead || "—"}${phone ? ` · ${phone}` : ""}${email ? ` · ${email}` : ""}`,
    `${total} bag(s)${doc.oversize ? ` (${doc.oversize} oversize)` : ""} · ${members.length || doc.family?.guests || 1} traveller(s) · ${doc.from ?? ""} → ${doc.to ?? ""}`,
    "",
    "PICKUPS",
    ...pickups.map((p, i) => `${i + 1}. ${[p.address, p.landmark, p.city, p.pincode].map(S).filter(Boolean).join(", ")} — ${prettyDate(S(p.date))}${p.slot ? `, ${slotText(S(p.slot))}` : ""}${p.lift ? ` · Lift: ${p.lift}` : ""}`),
  ];
  if (members.length) tl.push("", "GUESTS", ...members.map((m) => `- ${S(m.name) || m.id}${m.phone ? ` · ${intl(S(m.phone))}` : ""}${m.room ? ` · Room ${m.room}` : ""}`));
  if (bags.length) tl.push("", "BAGS", ...bags.map((b) => `- ${S(b.id)} · ${[S(b.colour), S(b.type)].filter(Boolean).join(" ")} · ${S(b.weight)} · ${memberName(b.owner)}${b.ret ? " · return requested" : ""}`));
  if (note) tl.push("", `NOTE: ${note}`);
  tl.push("", `Review in BAGDROP OS: ${adminUrl}`);

  /* ---------- HTML ---------- */
  const th = (t: string) => `<th align="left" style="padding:8px 10px;background:#F5F3F0;color:#78716C;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;border-bottom:1px solid #E7E2DC">${t}</th>`;
  const td = (t: string, extra = "") => `<td valign="top" style="padding:9px 10px;border-bottom:1px solid #F0ECE7;color:#292524;font-size:13px;line-height:1.5;${extra}">${t}</td>`;
  const section = (title: string, inner: string) => `<tr><td style="padding:22px 28px 0"><div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#EA580C;text-transform:uppercase;margin-bottom:8px">${title}</div>${inner}</td></tr>`;
  const kv = (rows: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E2DC;border-radius:10px;border-collapse:separate;overflow:hidden">${rows.filter(([, v]) => v).map(([k, v], i) => `<tr><td style="padding:9px 12px;width:34%;background:#FAF8F5;color:#78716C;font-size:12px;${i ? "border-top:1px solid #F0ECE7;" : ""}">${k}</td><td style="padding:9px 12px;color:#292524;font-size:13px;font-weight:600;${i ? "border-top:1px solid #F0ECE7;" : ""}">${v}</td></tr>`).join("")}</table>`;
  const chip = (t: string) => `<span style="display:inline-block;padding:3px 10px;border-radius:99px;background:#FFF1E6;color:#C2410C;font-size:12px;font-weight:700;margin-right:6px">${esc(t)}</span>`;

  const summaryChips = [chip(`${total} bag${total === 1 ? "" : "s"}`), doc.oversize ? chip(`${doc.oversize} oversize`) : "", chip(`${members.length || doc.family?.guests || 1} traveller${(members.length || doc.family?.guests || 1) === 1 ? "" : "s"}`), retBags.length ? chip(`${retBags.length} return`) : ""].join("");

  const pickupRows = pickups.map((p, i) => {
    const addr = [p.address, p.landmark && `Landmark: ${p.landmark}`, [p.city, p.pincode].map(S).filter(Boolean).join(" ")].map(S).filter(Boolean).map(esc).join("<br>");
    const n = bags.filter((b) => (b.pickup || pickups[0].id) === p.id).length;
    return `<tr>${td(`<b>${i + 1}</b>`)}${td(addr + (p.lift ? `<br><span style="color:#78716C">Lift: ${esc(p.lift)}</span>` : ""))}${td(`${esc(prettyDate(S(p.date)))}<br><span style="color:#78716C">${esc(slotText(S(p.slot)))}</span>`)}${td(String(n || "—"), "text-align:center")}</tr>`;
  }).join("");

  const guestRows = members.map((m) => {
    const n = bags.filter((b) => b.owner === m.id).length;
    return `<tr>${td(esc(S(m.name) || m.id))}${td(m.phone ? `<a href="tel:${esc(intl(S(m.phone)))}" style="color:#EA580C;text-decoration:none">${esc(intl(S(m.phone)))}</a>` : "—")}${td(esc(S(m.room)) || "—")}${td(String(n), "text-align:center")}</tr>`;
  }).join("");

  const bagRows = bags.map((b) => {
    const dest = b.ret ? [prettyDate(S(b.retDate) || S(st.ret?.date)), S(b.retSlot) && slotText(S(b.retSlot))].filter(Boolean).join(", ") : "";
    return `<tr>${td(`<span style="font-family:Consolas,Menlo,monospace;font-size:12px">${esc(S(b.id))}</span>`)}${td(esc([S(b.colour), S(b.type)].filter(Boolean).join(" ")))}${td(esc(S(b.weight)) || "—")}${td(esc(memberName(b.owner)) + (pickups.length > 1 ? `<br><span style="color:#78716C">${esc(pickupLabel(b.pickup))}</span>` : ""))}${td(b.ret ? `Return<br><span style="color:#78716C">${esc(dest)}</span>` : `<span style="color:#78716C">Carrying back</span>`)}</tr>`;
  }).join("");

  const retBlock = retBags.length || st.ret?.date || Number(st.extraReturn)
    ? kv([
        ["Bags returning", String(retBags.length)],
        ["Extra bags expected", Number(st.extraReturn) ? String(st.extraReturn) : ""],
        ["Return pickup", [prettyDate(S(st.ret?.date)), S(st.ret?.slot) && slotText(S(st.ret?.slot))].filter(Boolean).map(esc).join(" · ")],
        ["Return to", esc(S(st.ret?.address) || S(st.ret?.dest))],
      ])
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F5F3F0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3F0;padding:24px 0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<tr><td style="background:#EA580C;padding:22px 28px">
<div style="color:#ffffff;font-size:21px;font-weight:800;letter-spacing:.01em;font-family:Georgia,serif">BAGDROP</div>
<div style="color:#ffffff;opacity:.9;font-size:10px;font-weight:600;letter-spacing:.15em;margin-top:3px">INDIA'S FIRST DIGITAL BAGGAGE INFRASTRUCTURE</div></td></tr>
<tr><td style="padding:24px 28px 0">
<div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#78716C;text-transform:uppercase">New wedding booking · Y2K</div>
<div style="font-size:24px;font-weight:800;color:#1C1917;margin:6px 0 2px">${esc(familyName)}</div>
<div style="font-size:13px;color:#78716C">Booking <b style="color:#292524;font-family:Consolas,Menlo,monospace">${esc(doc.id)}</b>${sideLabel ? ` · ${esc(sideLabel)}` : ""}${created ? ` · received ${esc(created)}` : ""}</div>
<div style="margin-top:12px">${summaryChips}</div></td></tr>
${section("Contact", kv([
  ["Lead guest", esc(lead)],
  ["Mobile / WhatsApp", phone ? `<a href="tel:${esc(phone)}" style="color:#EA580C;text-decoration:none">${esc(phone)}</a> &nbsp;·&nbsp; <a href="https://wa.me/${esc(phone.replace(/\D/g, ""))}" style="color:#16A34A;text-decoration:none">WhatsApp</a>` : ""],
  ["Email", email ? `<a href="mailto:${esc(email)}" style="color:#EA580C;text-decoration:none">${esc(email)}</a>` : ""],
  ["Event", esc(S(doc.eventName) || S(doc.ucName))],
  ["Route", `${esc(S(doc.from))} → ${esc(S(doc.to))}`],
]))}
${section(`Pickups (${pickups.length})`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E2DC;border-radius:10px;border-collapse:separate;overflow:hidden"><tr>${th("#")}${th("Address")}${th("When")}${th("Bags")}</tr>${pickupRows}</table>`)}
${guestRows ? section(`Guests (${members.length})`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E2DC;border-radius:10px;border-collapse:separate;overflow:hidden"><tr>${th("Name")}${th("Mobile")}${th("Room")}${th("Bags")}</tr>${guestRows}</table>`) : ""}
${bagRows ? section(`Bags (${bags.length})`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E2DC;border-radius:10px;border-collapse:separate;overflow:hidden"><tr>${th("Tag")}${th("Bag")}${th("Weight")}${th("Owner")}${th("Return")}</tr>${bagRows}</table>`) : ""}
${retBlock ? section("Return journey", retBlock) : ""}
${note ? section("Notes from the family", `<div style="background:#FFF9F0;border:1px solid #F0E4D0;border-radius:10px;padding:12px 14px;color:#292524;font-size:14px;line-height:1.6">${esc(note)}</div>`) : ""}
<tr><td style="padding:26px 28px 24px" align="left">
<a href="${esc(adminUrl)}" style="display:inline-block;padding:12px 24px;background:#EA580C;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Review in BAGDROP OS</a>
<div style="margin-top:10px;font-size:12px;color:#78716C">Next step: confirm the booking with the family on WhatsApp and send the quote.</div></td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #E7E2DC;color:#78716C;font-size:11px;line-height:1.6">
BAGDROP LOGISTICS SOLUTIONS PRIVATE LIMITED<br>302, 3rd Floor, Ananta Stallion, Sevasi Sindhrot Road, B/S Sears Tower, Vadodara, Gujarat &ndash; 391101<br>+91 63 5711 5711 &middot; info@bagdrop.co &middot; www.bagdrop.co</td></tr>
</table></td></tr></table></body></html>`;

  return { text: tl.join("\n"), html, subject };
}
