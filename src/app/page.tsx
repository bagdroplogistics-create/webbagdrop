import BookingSection from "@/components/landing/BookingSection";
import CitiesStrip from "@/components/landing/CitiesStrip";
import ClosingCta from "@/components/landing/ClosingCta";
import FAQSection from "@/components/landing/FAQSection";
import HandoverBoard from "@/components/landing/HandoverBoard";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import { MotionGate } from "@/components/landing/motion";
import PainPoints from "@/components/landing/PainPoints";
import ReviewsMarquee from "@/components/landing/ReviewsMarquee";
import SiteFooter from "@/components/landing/SiteFooter";
import SiteHeader from "@/components/landing/SiteHeader";
import Solutions from "@/components/landing/Solutions";
import StatsCities from "@/components/landing/StatsCities";
import Testimonials from "@/components/landing/Testimonials";
import TrackDemo from "@/components/landing/TrackDemo";
import UseCases from "@/components/landing/UseCases";
import WhatsappFab from "@/components/landing/WhatsappFab";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip">
      <MotionGate />
      <SiteHeader />
      <Hero />
      <StatsCities />
      <CitiesStrip />
      <UseCases />
      <PainPoints />
      <Solutions />
      <HandoverBoard />
      <TrackDemo />
      <HowItWorks />
      <BookingSection />
      <Testimonials />
      <ReviewsMarquee />
      <FAQSection />
      <ClosingCta />
      <SiteFooter />
      <WhatsappFab />
    </main>
  );
}
