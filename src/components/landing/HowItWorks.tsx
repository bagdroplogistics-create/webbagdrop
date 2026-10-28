import { PROCESS_STEPS } from "./data";
import { ProcessTimeline } from "./ProcessTimeline";
import { Section, SectionHeading } from "./SectionHeading";

export default function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading kicker="How it works" title="Four steps to" accent="travel free." />
      <ProcessTimeline steps={PROCESS_STEPS} />
    </Section>
  );
}
