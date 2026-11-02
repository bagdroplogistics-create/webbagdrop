import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { ContactBlock, List, Section } from "@/components/legal/LegalPage";
import { CONTACT } from "@/lib/company";
import { PROHIBITED } from "@/lib/indemnity";

export const metadata: Metadata = { title: "Terms of Carriage · Bagdrop", description: "The terms on which Bagdrop picks up, carries and delivers your bags." };
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Terms() {
  return (
    <LegalPage kicker="Terms of Carriage" title="Terms of Carriage" intro="The terms on which Bagdrop picks up, carries and delivers your bags. By making a booking you agree to them, together with your booking confirmation and the baggage declaration you sign before pickup.">
      <Section n={1} title="Who we are">
        <p>{CONTACT.legalName} (&ldquo;Bagdrop&rdquo;, &ldquo;we&rdquo;) runs a door-to-door baggage service across India. &ldquo;You&rdquo; means the person who makes the booking and, where different, the traveller whose bags we carry.</p>
      </Section>
      <Section n={2} title="Bookings and prices">
        <List items={[
          <>Prices come from our published route rate chart. Rates are shown before GST; 5% GST is added to every booking. Routes not on the chart are quoted by our team on request.</>,
          <>A quoted price is held for 72 hours. After that it is re-priced on the chart in force at the time.</>,
          <>A booking is confirmed when Bagdrop approves it (or, on routes with instant booking, when it fits the instant rule) and your payment is received and verified.</>,
          <>You give us correct details: names, mobile, email, pickup and delivery addresses, dates and the number and type of bags. Extra or oversize bags found at pickup are charged at the chart rate.</>,
        ]} />
      </Section>
      <Section n={3} title="Before pickup">
        <List items={[
          <>We confirm your mobile or email with a one-time code.</>,
          <>Before your bags move, you sign the baggage declaration and indemnity bond once per booking — with an Aadhaar code for Indian travellers, or identity documents for international travellers. Bags do not move until it is signed.</>,
          <>Pack your bags securely for road, rail or air transport. Declare fragile items, and electronics or watches worth more than {inr(25000)}, in the declaration. We may decline a bag that is not packed safely.</>,
        ]} />
      </Section>
      <Section n={4} title="Pickup, handover and delivery">
        <List items={[
          <>At pickup every bag is sealed, photographed and tagged with its own tag number, and every later handover is recorded against that tag.</>,
          <>We deliver to the address, hotel or airport given in your booking. Delivery dates we share are our planned dates; we tell you promptly if a date changes.</>,
          <>If nobody is available at pickup or delivery, we contact you to arrange a new time. Someone you authorise may hand over or receive the bags if you tell us in advance.</>,
          <>We are not responsible for delays caused by events outside our control, such as weather, strikes, road or rail closures, or orders of the authorities.</>,
        ]} />
      </Section>
      <Section n={5} title="Prohibited and restricted items">
        <p>Your bags must not contain the items below. Bagdrop may refuse, hold or hand over to the authorities any bag suspected of containing a prohibited item; in that case the booking is cancelled and no refund is due.</p>
        <div className="space-y-3">
          {PROHIBITED.map((g) => (
            <div key={g.id} className="rounded-xl bg-paper p-3.5">
              <p className="font-semibold text-ink">{g.title}</p>
              {g.law && <p className="text-[13px] text-muted">{g.law}</p>}
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] marker:text-brand">{g.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section n={6} title="Inspection">
        <p>Bags may be screened or X-rayed, and authorised officials (CISF, BCAS, airline, RPF, police or customs) may open and inspect them, in your absence if needed.</p>
      </Section>
      <Section n={7} title="Insurance, liability and claims">
        <List items={[
          <>Every shipment is covered by transit insurance up to {inr(CONTACT.insuranceCap)} per shipment, subject to the terms of the cover.</>,
          <>Beyond that cover, Bagdrop&apos;s liability for loss or damage is limited as provided under the Carriage by Road Act, 2007 and the Railways Act, 1989, as applicable. We are not liable for indirect or consequential loss, or for loss caused by undeclared, prohibited or unsafely packed contents.</>,
          <>If a bag arrives damaged or a seal is broken, note it at delivery if you can and tell us as soon as possible, with photographs. We compare them with the photographs taken at pickup and handle the claim with you and the insurer.</>,
        ]} />
      </Section>
      <Section n={8} title="Changes, cancellations and refunds">
        <p>Date changes depend on availability. Cancellations and refunds follow our <Link href="/refund" className="font-semibold text-ink underline decoration-brand underline-offset-4">Refund and Cancellation Policy</Link>. Event bookings close on the date the event sets; after that only our team can change them.</p>
      </Section>
      <Section n={9} title="Your information">
        <p>We use your information only to run your move and as our <Link href="/privacy" className="font-semibold text-ink underline decoration-brand underline-offset-4">Privacy Policy</Link> explains.</p>
      </Section>
      <Section n={10} title="Law and disputes">
        <p>These terms are governed by the laws of India. Please contact us first so we can try to resolve any concern; disputes are subject to the courts with jurisdiction over our registered office.</p>
      </Section>
      <Section title="Contact">
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
