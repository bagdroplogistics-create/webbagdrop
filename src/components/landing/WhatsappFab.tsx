import { WHATSAPP_URL } from "./data";
import { Icon } from "./Icon";

export default function WhatsappFab() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      aria-label="WhatsApp us"
      className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-card-lg transition-transform hover:-translate-y-0.5"
    >
      <Icon name="whatsapp" size={26} strokeWidth={2} />
    </a>
  );
}
