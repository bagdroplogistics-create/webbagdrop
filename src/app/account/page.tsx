import type { Metadata } from "next";
import AccountClient from "./AccountClient";

export const metadata: Metadata = { title: "My bookings · Bagdrop" };

export default function AccountPage() {
  return <AccountClient />;
}
