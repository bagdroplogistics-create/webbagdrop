import type { Metadata } from "next";
import MyBags from "./MyBags";

/** /e/[code]/my — the wedding guest dashboard: sign in with the mobile the
 *  family booked with, see every bag's tag code and stage, and book again. */

export const metadata: Metadata = {
  title: "My Bags · Y2K Wedding",
};

export default function MyBagsPage() {
  return <MyBags />;
}
