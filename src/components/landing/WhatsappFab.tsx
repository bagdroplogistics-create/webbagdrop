import { WHATSAPP_URL } from "./data";

export default function WhatsappFab() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      aria-label="WhatsApp us"
      className="fixed bottom-5 right-5 z-50 flex h-12 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-semibold text-white shadow-card-lg transition-transform hover:-translate-y-0.5"
    >
      WhatsApp
    </a>
  );
}
