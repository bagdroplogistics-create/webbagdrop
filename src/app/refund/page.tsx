import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { ContactBlock, List, Section } from "@/components/legal/LegalPage";
import { CONTACT } from "@/lib/company";

export const metadata: Metadata = { title: "Refund and Cancellation Policy · Bagdrop", description: "How to cancel a Bagdrop booking and how refunds work." };

export default function Refund() {
  return (
    <LegalPage kicker="Refunds" title="Refund and Cancellation Policy" intro="How to change or cancel a booking, and how refunds reach you.">
      <Section n={1} title="Cancelling a booking">
        <List items={[
          <>Tell us on WhatsApp ({CONTACT.whatsapp[0]}) or by email ({CONTACT.email}) with your booking number.</>,
          <><b>{CONTACT.fullRefundDays} days or more before the scheduled pickup:</b> full refund.</>,
          <><b>Less than {CONTACT.fullRefundDays} days before pickup:</b> contact us — any refund depends on what has already been arranged for your move, and we confirm the amount in writing before you decide.</>,
          <>After your bags have been picked up, the booking can no longer be cancelled.</>,
        ]} />
      </Section>
      <Section n={2} title="When Bagdrop cancels">
        <p>If we cannot carry out a confirmed booking, you receive a full refund. If you paid twice for the same booking, the extra payment is refunded in full.</p>
      </Section>
      <Section n={3} title="When no refund is due">
        <p>No refund is due when a bag is refused, held or handed to the authorities because it contains a prohibited item, as set out in our <Link href="/terms" className="font-semibold text-ink underline decoration-brand underline-offset-4">Terms of Carriage</Link> and the baggage declaration.</p>
      </Section>
      <Section n={4} title="How refunds are paid">
        <List items={[
          <>Online payments are refunded to the same card, UPI or bank account through Razorpay.</>,
          <>Bank transfers and UPI payments made directly to us are refunded to the account they came from.</>,
          <>Banks usually take 5–7 working days to show a refund after we issue it.</>,
          <>If you prefer, we can issue a credit note for a future booking instead; it is valid until the date shown on it.</>,
        ]} />
      </Section>
      <Section n={5} title="Changing a booking">
        <p>Changes to dates or the number of bags depend on availability; extra bags are charged at the chart rate. Event bookings close on the date the event sets, after which only our team can make changes.</p>
      </Section>
      <Section title="Contact">
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
