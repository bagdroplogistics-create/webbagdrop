/** Company letterhead details — matches the original static build's
 *  shared/config.js company block. Used only for document rendering. */
export const COMPANY = {
  name: "BAGDROP LOGISTICS SOLUTIONS PRIVATE LIMITED",
  tagline: "Excess baggage & door-to-door luggage delivery across India",
  address: "302, 3rd Floor, Ananta Stallion, Sevasi Sindhrot Road, B/S Sears Tower, Vadodara, Gujarat – 391101",
  phone: "+91 63 5711 5711",
  email: "info@bagdrop.co",
  web: "www.bagdrop.co",
  gstin: "24AAACC9320N2ZL",
  pan: "AAACC9320N",
  sac: "9965",
};

/** Contact and policy details for the public pages (Terms, Privacy, Refunds,
 *  Contact, About) — from the brand kit's official contact block. */
export const CONTACT = {
  legalName: "Bagdrop Logistics Solutions Private Limited",
  brand: "Bagdrop",
  gstin: "24AAACC9320N2ZL",
  registered: "302, 3rd Floor, Ananta Stallion, Sevasi Sindhrot Road, B/S Sears Tower, Vadodara, Gujarat – 391101",
  mumbai: "Shop No. 1/B, S.L. Matkar Marg, Opp. Orbit Tower, Near Dipanker Building, Prabhadevi (West), Mumbai – 400025",
  phone: "+91 96245 16662",
  whatsapp: ["+91 63 5711 5711", "+91 63 5733 5733"],
  whatsappUrl: "https://wa.me/916357115711",
  email: "info@bagdrop.co",
  site: "www.bagdrop.co",
  /** transit insurance cover per shipment, in rupees */
  insuranceCap: 50000,
  /** full refund when cancelled at least this many days before pickup */
  fullRefundDays: 7,
  /** the date these policies take effect (shown on each page) */
  policyDate: "1 November 2026",
} as const;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " + twoDigits(n % 100) : ""}`;
}

/** Indian numbering (crore/lakh/thousand), e.g. 630000 -> "Six Lakh Thirty Thousand". */
export function inWords(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ") || "Zero";
}

export function inrWords(n: number): string {
  return `Rupees ${inWords(n)} Only`;
}
