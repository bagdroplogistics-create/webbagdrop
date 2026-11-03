/** deploy/y2k only — this branch's sole purpose is bagdrop.co/y2k, a short,
 *  shareable link to the Y2K wedding desk (see next.config.ts's withBase()
 *  note on why: a proxy rewrite that shortens the path, "/y2k" -> "/y2k/e/y2k",
 *  confuses the client router after hydration, since it's reconciled against
 *  the browser's real address bar, not the server-side path it was fetched
 *  from. Putting the desk at this build's own root sidesteps that — the
 *  bagdrop.co/y2k rewrite becomes a plain, symmetric prefix match, same as
 *  /admin-1's. This branch never merges back into main, so it losing the
 *  general marketing homepage at "/" is fine — nothing browses this
 *  deployment's own .vercel.app URL directly. */
import Y2kDesk from "./e/[code]/Y2kDesk";

export default function Home() {
  return <Y2kDesk />;
}
