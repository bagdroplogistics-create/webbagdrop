import { redirect } from "next/navigation";

/** The booking flow lives on the homepage (#book) — this old route simply
 *  forwards there, so bookmarked links keep working. */
export default function NewBookingRedirect() {
  redirect("/#book");
}
