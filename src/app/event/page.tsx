import type { Metadata } from "next";
import EventPortal from "./EventPortal";

/** /event — the event company's desk: sign in with a WhatsApp code to a
 *  mobile listed on the event, then answer guests, set rooms, accept return
 *  bags and print tags for that event only. */
export const metadata: Metadata = { title: "Event desk · Bagdrop" };

export default function EventPage() {
  return <EventPortal />;
}
