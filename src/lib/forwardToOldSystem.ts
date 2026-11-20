/** Mirrors a new Y2K wedding booking into the OLD Bagdrop system (bagdrop.co admin
 *  dashboard + Leads tab + ops WhatsApp) via its /api/y2k/forward endpoint.
 *  Best-effort: a short timeout and every error swallowed, so the old system being
 *  slow or down can never delay or fail a real booking (it is already saved here).
 *  Needs two env vars on THIS project, identical secret on the old project:
 *    OLD_SYSTEM_URL        (default https://www.bagdrop.co)
 *    Y2K_FORWARD_SECRET    (shared secret; unset = forwarding is skipped) */
import type { Booking } from "./types";

export async function forwardToOldSystem(doc: Booking, details: string): Promise<void> {
  const secret = process.env.Y2K_FORWARD_SECRET;
  if (!secret) return;
  const base = (process.env.OLD_SYSTEM_URL || "https://www.bagdrop.co").replace(/\/$/, "");
  const st = ((doc.wedding as { state?: { members?: unknown[]; pickups?: { address?: string; pincode?: string; city?: string }[]; family?: { side?: string }; bags?: { ret?: boolean; retDate?: string; retSlot?: string }[]; ret?: { date?: string; slot?: string; dest?: string; address?: string } } } | undefined)?.state) ?? {};
  // Return journey — same fields the inquiry-desk email shows.
  const slotLabel = (v: string) => ({ morning: "Morning · 10 AM–1 PM", midday: "Midday · 1–3 PM", afternoon: "Afternoon · 1–3 PM", evening: "Evening · 3–6 PM" } as Record<string, string>)[v.toLowerCase()] ?? v;
  const retBagList = (st.bags ?? []).filter((b) => b.ret);
  const retDate = String(st.ret?.date ?? retBagList[0]?.retDate ?? "").trim();
  const retSlotRaw = String(st.ret?.slot ?? retBagList[0]?.retSlot ?? "").trim();
  const retTo = String(st.ret?.address ?? st.ret?.dest ?? "").trim();
  const p1 = st.pickups?.[0];
  const pickupAddress = [p1?.address, p1?.city, p1?.pincode].filter(Boolean).join(", ") || doc.pickAddr || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/y2k/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forward-secret": secret },
      signal: controller.signal,
      body: JSON.stringify({
        id: doc.id,
        name: doc.traveller?.name ?? "",
        phone: doc.traveller?.mobile ?? "",
        email: doc.traveller?.email ?? "",
        familyName: doc.family?.name ?? "",
        side: doc.family?.side ?? st.family?.side ?? "",
        guests: (st.members?.length ?? doc.family?.guests ?? 1) || 1,
        bags: doc.bags ?? 1,
        oversize: doc.oversize ?? 0,
        from: doc.from ?? "",
        to: doc.to ?? "",
        pickupAddress,
        date: doc.date ?? "",
        slot: doc.slot ?? "",
        note: doc.note ?? "",
        eventName: (doc as { eventName?: string; ucName?: string }).eventName ?? (doc as { ucName?: string }).ucName ?? "",
        retBags: retBagList.length,
        retDate,
        retSlot: retSlotRaw ? slotLabel(retSlotRaw) : "",
        retTo,
        details,
      }),
    });
    if (!res.ok) console.error("forwardToOldSystem non-OK:", res.status, (await res.text().catch(() => "")).slice(0, 300));
  } catch (e) {
    console.error("forwardToOldSystem failed (non-fatal):", e);
  } finally {
    clearTimeout(timer);
  }
}
