import Wizard from "@/components/booking/Wizard";
import { Section, SectionHeading } from "./SectionHeading";

/** Wraps the existing booking Wizard — untouched — as the landing page's
 *  single booking flow. Every CTA on the page points at #book. */
export default function BookingSection() {
  return (
    <Section id="book" bleedClassName="bg-paper/50" className="!pb-20">
      <SectionHeading kicker="Book now" title="Get your" accent="instant quote." />
      <Wizard />
    </Section>
  );
}
