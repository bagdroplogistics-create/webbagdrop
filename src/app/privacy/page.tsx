import type { Metadata } from "next";
import LegalPage, { ContactBlock, List, Section } from "@/components/legal/LegalPage";
import { CONTACT } from "@/lib/company";

export const metadata: Metadata = { title: "Privacy Policy · Bagdrop", description: "What personal data Bagdrop collects, why, who it is shared with, and your rights." };

export default function Privacy() {
  return (
    <LegalPage kicker="Privacy" title="Privacy Policy" intro="What personal data Bagdrop collects, why we need it, who we share it with, and the choices you have. We follow India's Digital Personal Data Protection Act, 2023.">
      <Section n={1} title="What we collect">
        <List items={[
          <><b>Booking details:</b> your name, mobile number, email, pickup and delivery addresses, travel dates, and the names of the people travelling with you.</>,
          <><b>Bag details:</b> the number and type of bags, their tag numbers, and the photographs taken when they are sealed at pickup and at each handover.</>,
          <><b>Identity for the baggage declaration:</b> for Indian travellers we verify Aadhaar with a one-time code and keep only the last four digits; international travellers upload identity documents, which we store securely for that booking.</>,
          <><b>Payments:</b> payment references from Razorpay, and any payment screenshot or bank reference you send us. We never see or store your card or UPI PIN.</>,
          <><b>Messages:</b> the WhatsApp and email updates we send you, and messages you send us about your bags.</>,
          <><b>Driver location:</b> while a move is in progress, our driver&apos;s phone shares its location so you can follow your bags. We do not track your location.</>,
        ]} />
      </Section>
      <Section n={2} title="Why we use it">
        <List items={[
          <>To quote, confirm, pick up, carry and deliver your bags, and to keep you updated.</>,
          <>To verify your identity and the baggage declaration that the law requires before bags move.</>,
          <>To take payment, issue GST invoices and keep the accounting records the law requires.</>,
          <>To handle questions, claims and complaints, and to keep our service safe.</>,
        ]} />
        <p>We do not sell your data and we do not use it for third-party advertising.</p>
      </Section>
      <Section n={3} title="Who we share it with">
        <p>Only what each needs to do its job:</p>
        <List items={[
          <>Our drivers and handover partners, for your pickup and delivery details.</>,
          <>Razorpay (payments), Meta WhatsApp and our email provider (messages), and our hosting and database providers (Vercel and Supabase).</>,
          <>Our insurer, if you make a claim.</>,
          <>Government and security authorities (such as CISF, BCAS, RPF, police or customs) when the law requires it.</>,
          <>Your event organiser, for event bookings — limited to your booking, room and bag status.</>,
        ]} />
      </Section>
      <Section n={4} title="Cookies">
        <p>We use only the cookies needed to keep you signed in to your bookings, partner or team account. We do not use advertising or analytics cookies.</p>
      </Section>
      <Section n={5} title="How long we keep it">
        <p>We keep booking data for as long as needed to complete your move and handle any claim, and for as long as tax and other laws require us to keep records. After that it is deleted or anonymised.</p>
      </Section>
      <Section n={6} title="Security">
        <p>Your data is stored with access limited to the staff who need it, every team member signs in with their own password, and every change is recorded. Links we send you are signed so they cannot be guessed.</p>
      </Section>
      <Section n={7} title="Your rights">
        <List items={[
          <>Ask what personal data we hold about you and how we use it.</>,
          <>Ask us to correct, complete or update it.</>,
          <>Ask us to erase it, unless the law requires us to keep it.</>,
          <>Withdraw consent for anything that relies on it (this may stop us from carrying your bags).</>,
          <>Nominate someone to exercise these rights for you, and raise a grievance with us — and, if not resolved, with the Data Protection Board of India.</>,
        ]} />
        <p>Write to <a className="font-semibold text-ink underline decoration-brand underline-offset-4" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> with the subject &ldquo;Privacy request&rdquo;. We reply within 30 days.</p>
      </Section>
      <Section title="Grievance contact">
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
