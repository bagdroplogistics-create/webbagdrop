import type { Metadata } from "next";
import EventDesk from "./EventDesk";

/** /e/[code] — on-site wedding desks by event code. Today that's the Y2K
 *  wedding desk (codes "y2k" / "Y2K-WED"); other codes get the same gentle
 *  "not open yet" the landing page shows. Append ?ops=1 (signed in at
 *  /admin) for the on-site ops manifest. The code is read in the browser
 *  (see EventDesk.tsx). */

export const metadata: Metadata = {
  title: "Y2K Wedding Bag Desk",
};

export default function EventDeskPage() {
  return <EventDesk />;
}
