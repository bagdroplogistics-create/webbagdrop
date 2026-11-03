/** The wedding tag print sheet, for BAGDROP OS and the event company portal.
 *  ?event=&id=&media=4x6|ql62x100|a4&only=new|reprint&mark=1&print=1
 *  only=new → tags never printed; only=reprint → printed tags whose room changed.
 *  mark=1 records what each tag said (so a later room change flags a reprint). */
import { NextResponse } from "next/server";
import { mutateBooking } from "./bookingStore";
import { markPrinted } from "./weddingOps";
import { weddingTags, weddingTagsHtml, WEDDING_TAG_MEDIA, type WeddingTagMedia } from "./weddingTags";
import type { serviceClient } from "./supabaseAdmin";
import type { BagdropEvent, Booking } from "./types";

type SB = NonNullable<ReturnType<typeof serviceClient>>;

export async function tagSheet(sb: SB, url: string, allowed: BagdropEvent[] | null): Promise<NextResponse> {
  const q = new URL(url).searchParams;
  const event = (q.get("event") ?? "").slice(0, 40), id = q.get("id"), only = q.get("only");
  const media = (q.get("media") ?? "4x6") as WeddingTagMedia;
  if (!event) return NextResponse.json({ error: "MISSING_EVENT" }, { status: 400 });
  if (!WEDDING_TAG_MEDIA.includes(media)) return NextResponse.json({ error: "BAD_MEDIA" }, { status: 400 });
  if (allowed !== null && !allowed.some((e) => e.id === event)) return NextResponse.json({ error: "NO_EVENT" }, { status: 404 });

  const { data: evRow } = await sb.from("events").select("doc").eq("id", event).maybeSingle();
  const ev = evRow?.doc as BagdropEvent | undefined;
  if (!ev) return NextResponse.json({ error: "NO_EVENT" }, { status: 404 });
  const { data, error } = await sb.from("bookings").select("doc").eq("doc->>eventCode", event).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let bookings = (data ?? []).map((r) => r.doc as Booking)
    .filter((b) => b.wedding && (id ? b.id === id : !["rejected", "cancelled"].includes(b.status)))
    .sort((a, b) => (a.family?.name ?? a.traveller.name).localeCompare(b.family?.name ?? b.traveller.name) || a.id.localeCompare(b.id));
  if (id && !bookings.length) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  /* only some tags: keep each booking but drop the bags that don't qualify */
  const keep = only === "new" ? (t: { printed: boolean }) => !t.printed : only === "reprint" ? (t: { reprint: boolean }) => t.reprint : null;
  let filterTags: ((b: Booking) => Set<string>) | null = null;
  if (keep) {
    filterTags = (b) => new Set(weddingTags(b).filter((t) => keep(t as never)).map((t) => t.tag));
    bookings = bookings.filter((b) => filterTags!(b).size > 0);
  }
  if (q.get("mark") === "1") {
    const at = new Date().toISOString();
    for (const b of bookings) await mutateBooking(sb, b.id, (fresh) => markPrinted(fresh, at, filterTags ? filterTags(b) : undefined));
  }
  const title = (id ? `${id} · ${bookings[0]?.family?.name ?? bookings[0]?.traveller.name ?? ""}` : `${ev.name} · all families`)
    + (only === "new" ? " · not printed yet" : only === "reprint" ? " · room changed, reprint" : "");
  const html = weddingTagsHtml(bookings, media, {
    hashtag: ev.landing?.hashtag ?? ev.id, names: ev.landing?.names ?? ev.name, venue: ev.venue || ev.venueCity, venueCity: ev.venueCity,
  }, title, { autoPrint: q.get("print") === "1", only: filterTags ?? undefined });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
