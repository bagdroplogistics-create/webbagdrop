/** Static copy for the public landing page, carried over from the Motion
 *  Base mockup (`Bagdrop Website v4.dc.html`) and trimmed of claims that
 *  can't be backed up (e.g. "live" bag tracking — it's WhatsApp/email
 *  updates today, so copy says that, not "real-time GPS"). */

export const NAV = [
  { href: "#usecases", label: "Use cases" },
  { href: "#why", label: "Why Bagdrop" },
  { href: "#solutions", label: "Solutions" },
  { href: "#handovers", label: "Handovers" },
  { href: "#track", label: "Track" },
  { href: "#faq", label: "FAQ" },
] as const;

export const STATS = [
  { value: "12,000+", label: "Bags delivered" },
  { value: "50+", label: "Cities covered" },
  { value: "24h", label: "Advance booking" },
  { value: "4.9 / 5", label: "Customer rating", brand: true },
] as const;

export const CITIES = ["Mumbai", "Delhi", "Ahmedabad", "Vadodara", "Goa", "Gujarat", "Rajasthan", "Hyderabad", "Bangalore"];

export type UseCase = { problem: string; solution: string; icon: string; image: string };
export const USE_CASES: UseCase[] = [
  { problem: "Over your airline allowance", solution: "Excess baggage", icon: "plane", image: "/images/landing/excess.jpg" },
  { problem: "Landing in a new city", solution: "Airport delivery", icon: "landing", image: "/images/landing/airport.jpg" },
  { problem: "Need an early hotel check-in", solution: "Hotel delivery", icon: "hotel", image: "/images/landing/hotel.jpg" },
  { problem: "Long train journey ahead", solution: "Railway station drop", icon: "train", image: "/images/landing/railway.jpg" },
  { problem: "Family cruise departure", solution: "Cruise baggage", icon: "cruise", image: "/images/landing/cruise.jpg" },
  { problem: "Moving city to city", solution: "Door-to-door", icon: "home", image: "/images/landing/door.jpg" },
  { problem: "Destination wedding", solution: "Wedding logistics", icon: "wedding", image: "/images/wedding-slide.jpg" },
  { problem: "Moving abroad for study", solution: "Student relocation", icon: "graduate", image: "/images/student-slide.jpg" },
];

export type Pain = { big: string; pain: string; fix: string; image: string };
export const PAINS: Pain[] = [
  { big: "₹3,000–8,000", pain: "Airline excess-baggage fees, every trip", fix: "Save 40–60% with Bagdrop", image: "/images/landing/excess.jpg" },
  { big: "Queues", pain: "Trolleys and queues at every terminal", fix: "Walk out empty-handed", image: "/images/landing/queue.jpg" },
  { big: "Stairs", pain: "Platforms, stairs and coach racks", fix: "Board with just a day bag", image: "/images/landing/railway.jpg" },
  { big: "Hands full", pain: "Kids, parents and wedding trunks to manage", fix: "We carry, you travel", image: "/images/landing/family.jpg" },
];

export type Solution = { title: string; icon: string; tag?: string; image: string };
export const SOLUTIONS: Solution[] = [
  { title: "Airport Delivery", icon: "plane", tag: "Most popular", image: "/images/landing/airport.jpg" },
  { title: "Door-to-Door", icon: "home", image: "/images/landing/door.jpg" },
  { title: "Hotel Delivery", icon: "hotel", image: "/images/landing/hotel.jpg" },
  { title: "Railway Station", icon: "train", image: "/images/landing/railway.jpg" },
  { title: "Cruise Baggage", icon: "cruise", image: "/images/landing/cruise.jpg" },
  { title: "Excess Baggage", icon: "landing", tag: "Save 40–60%", image: "/images/landing/excess.jpg" },
  { title: "Destination Weddings", icon: "wedding", tag: "White-glove", image: "/images/wedding-slide.jpg" },
  { title: "Student Relocation", icon: "graduate", image: "/images/student-slide.jpg" },
  { title: "Corporate Travel", icon: "briefcase", tag: "GST invoices", image: "/images/landing/corporate.jpg" },
  { title: "Group Bookings", icon: "group", tag: "Up to 30 bags", image: "/images/landing/group.jpg" },
  { title: "Sports & Oversized", icon: "globe", image: "/images/landing/sports.jpg" },
  { title: "Baggage Pickup", icon: "box", image: "/images/landing/pickup.jpg" },
];

/** The hero's 4-step motion slider — same four steps as the Motion Base
 *  mockup's scroll-story hero (Book / Pickup / Transit / Delivered), run
 *  as an in-place auto-advancing slider rather than a full-page
 *  scroll-jack (which fails badly on mobile and fights the page's own
 *  scroll). */
export const STORY_STEPS = [
  { n: "01", tag: "BOOK", a: "Book in", b: "two minutes.", d: "Choose your route, bags and pickup slot." },
  { n: "02", tag: "PICKUP", a: "We come", b: "to your door.", d: "Sealed, photographed and insured at pickup." },
  { n: "03", tag: "TRANSIT", a: "Your bags", b: "travel first.", d: "WhatsApp and email updates at every stage." },
  { n: "04", tag: "DELIVERED", a: "You arrive", b: "empty-handed.", d: "Bags waiting at your hotel, home or terminal." },
];

export const PROCESS_STEPS = [
  { n: "01", t: "Book", d: "Choose your route, bag count and pickup slot. Takes under 2 minutes." },
  { n: "02", t: "Pickup", d: "Our team arrives at your door in the confirmed slot — sealed and photographed." },
  { n: "03", t: "Updates", d: "WhatsApp and email updates at every stage — pickup, in transit, delivered." },
  { n: "04", t: "Delivery", d: "Your bags arrive at the destination, before you do. Always insured." },
];

/** A handover's zone layout — the walk from "your door" to "Bagdrop"
 *  through the venue, same five-zone breakdown as the Motion Base
 *  mockup's live board. kind "bd" = the Bagdrop handover point, "skip" =
 *  a step you skip entirely, "" = a zone you still walk through. */
export type Zone = { label: string; kind: "bd" | "skip" | "" };
export type HandoverRow = {
  time: string; code: string; service: string; from: string; to: string; icon: string;
  kicker: string; title: string; body: string; zones: Zone[]; foot: string;
};
export const BOARD_STATUSES = ["BOOKED", "PICKED UP", "IN TRANSIT", "DELIVERED"] as const;
export const HANDOVERS: HandoverRow[] = [
  {
    time: "06:40", code: "BD 101", service: "Airport", from: "Arrivals · BOM T2", to: "Your hotel or home", icon: "plane",
    kicker: "AIRPORT ARRIVALS", title: "Land and walk out empty-handed.",
    body: "We collect your bags at arrivals and deliver them to your hotel or home. Or we pick up from home and deliver straight to the airport.",
    zones: [{ label: "Baggage belt", kind: "" }, { label: "Customs exit", kind: "" }, { label: "Arrivals hall", kind: "" }, { label: "Bagdrop handover", kind: "bd" }, { label: "Taxi / exit", kind: "" }],
    foot: "HANDOVER AT ARRIVALS · BAGS REACH YOU BEFORE YOUR TAXI",
  },
  {
    time: "08:15", code: "BD 204", service: "Excess baggage", from: "Your door", to: "Destination city", icon: "landing",
    kicker: "AIRLINE CHECK-IN", title: "Skip the excess baggage counter.",
    body: "Airlines charge ₹3,000–8,000 for excess baggage. Bagdrop ships the same bag for significantly less — and picks it up from your door.",
    zones: [{ label: "Your door", kind: "bd" }, { label: "Check-in counter", kind: "" }, { label: "Excess fee desk", kind: "skip" }, { label: "Security", kind: "" }, { label: "Gate", kind: "" }],
    foot: "HANDOVER AT YOUR DOOR · SAVE 40–60% ON EXCESS FEES",
  },
  {
    time: "10:30", code: "BD 318", service: "Railway station", from: "Your door", to: "Arrival station", icon: "train",
    kicker: "RAILWAY STATION", title: "Board the train with just a day bag.",
    body: "We collect your luggage before you leave and meet you at the arrival station forecourt, so stairs, platforms and coach racks stay light.",
    zones: [{ label: "Your door", kind: "bd" }, { label: "Forecourt", kind: "" }, { label: "Platform", kind: "" }, { label: "Coach", kind: "" }, { label: "Arrival forecourt", kind: "bd" }],
    foot: "HANDOVER AT DOOR AND ARRIVAL FORECOURT",
  },
  {
    time: "12:05", code: "BD 422", service: "Hotel", from: "Airport or home", to: "Hotel front desk", icon: "hotel",
    kicker: "HOTEL", title: "Hotels are one of our most common delivery addresses.",
    body: "We coordinate with the front desk to ensure seamless handover. Your bags are there before your taxi arrives — not the next morning.",
    zones: [{ label: "Porch", kind: "" }, { label: "Lobby", kind: "" }, { label: "Front desk", kind: "bd" }, { label: "Luggage room", kind: "" }, { label: "Your room", kind: "" }],
    foot: "HANDOVER AT THE FRONT DESK",
  },
  {
    time: "14:50", code: "BD 509", service: "Cruise", from: "Your door", to: "Cruise terminal", icon: "cruise",
    kicker: "CRUISE TERMINAL", title: "Board with nothing but a day bag.",
    body: "We collect your bags from home and deliver them to the cruise terminal or your pre-cruise hotel, sealed, photographed and insured.",
    zones: [{ label: "Drop-off zone", kind: "" }, { label: "Terminal hall", kind: "" }, { label: "Baggage hall", kind: "bd" }, { label: "Check-in", kind: "" }, { label: "Gangway", kind: "" }],
    foot: "HANDOVER AT THE TERMINAL BAGGAGE HALL",
  },
  {
    time: "17:20", code: "BD 616", service: "Door-to-Door", from: "Goa doorstep", to: "Mumbai home", icon: "home",
    kicker: "DOOR-TO-DOOR", title: "Send luggage between any two addresses.",
    body: "Across Gujarat, Maharashtra, and Goa. No airport, no hassle.",
    zones: [{ label: "Pickup door", kind: "bd" }, { label: "Bagdrop vehicle", kind: "" }, { label: "Hub", kind: "" }, { label: "In transit", kind: "" }, { label: "Delivery door", kind: "bd" }],
    foot: "24 / 48 / 72 HOUR DELIVERY",
  },
];

export const TRACK_DEMO_STEPS = [
  { tag: "STEP 01", l: "Booked", time: "09:12", d: "Booking confirmed · pickup slot 11:00–12:00" },
  { tag: "STEP 02", l: "Sealed & photographed", time: "11:08", d: "3 bags documented at your doorstep" },
  { tag: "STEP 03", l: "Picked up", time: "11:20", d: "Loaded into a dedicated Bagdrop vehicle" },
  { tag: "STEP 04", l: "In transit", time: "16:45", d: "Goa → Mumbai · on schedule" },
  { tag: "STEP 05", l: "Delivered", time: "10:30", d: "Handed over at your Mumbai home" },
];

export type Client = { name: string; img?: string; bags: string; route: string };
export const CLIENTS: Client[] = [
  { name: "Hiral Shah Ratnani", bags: "5 bags delivered", route: "Vadodara → Mumbai" },
  { name: "Brijesh Patel", img: "/images/testimonials/brijesh-patel.jpg", bags: "6 bags delivered", route: "Vadodara → Mumbai" },
  { name: "Suyash Vaishnav", img: "/images/testimonials/suyash-vaishnav.jpg", bags: "3 bags delivered", route: "Vadodara → Mumbai" },
  { name: "Shimoli Joshi", img: "/images/testimonials/shimoli-joshi.jpg", bags: "2 bags delivered", route: "Vadodara → Mumbai" },
  { name: "Nimesh Shah", img: "/images/testimonials/nimesh-shah.jpg", bags: "3 bags delivered", route: "Vadodara → Mumbai" },
];

export const REVIEWS = [
  { i: "KC", n: "Kavitha Chandrasekaran", w: "2 days ago", q: "Had a good experience with Bagdrop. Affordable price, they delivered the baggage on time." },
  { i: "SB", n: "Saurabh Bafna", w: "8 weeks ago", q: "Used Bagdrop three times and each experience has been seamless — reliable, and takes the stress out of travelling with heavy luggage." },
  { i: "PS", n: "Priya Shah", w: "17 weeks ago", q: "Our luggage got picked up from our doorstep in Goa and delivered to our Bombay house. Highly recommend." },
  { i: "PA", n: "Poonam Agrawal", w: "17 weeks ago", q: "Everything was well planned, from pickup of luggage till the drop at the international airport." },
  { i: "SM", n: "Saurabh Muley", w: "17 weeks ago", q: "Bags were picked up on time, properly wrapped and delivered on schedule. Smooth, hassle-free." },
  { i: "SS", n: "Snehal Shah", w: "10 weeks ago", q: "Really nice experience — on time for pickup as well as drop." },
];

export type FaqItem = { q: string; a: string };
export const FAQ: { cat: string; items: FaqItem[] }[] = [
  {
    cat: "Booking", items: [
      { q: "How far in advance do I need to book?", a: "At least 24 hours for airport pickups and intercity moves. Same-day may be available in select cities — check at checkout." },
      { q: "Can I change or cancel my booking?", a: "Yes — contact us on WhatsApp. For a full refund, cancellations must be made at least 7 days before the scheduled pickup." },
      { q: "How do I book for a group?", a: "Use the Group / Wedding option — up to 30 bags in one booking. For larger volumes, contact us for a custom quote." },
    ],
  },
  {
    cat: "Pickup & delivery", items: [
      { q: "What happens on the day of pickup?", a: "Our executive coordinates pickup time with you directly." },
      { q: "What if I'm not home for pickup?", a: "You can authorize someone else to hand over your bags — just let us know in advance so we can update the booking." },
      { q: "Do you deliver to hotels?", a: "Yes — we coordinate with the front desk for a seamless handover." },
    ],
  },
  {
    cat: "Updates & insurance", items: [
      { q: "Can I track my bag?", a: "You get WhatsApp and email updates at every stage — pickup, in transit, delivered. Live GPS tracking is on our roadmap." },
      { q: "What if my bag is damaged or lost?", a: "You can add up to ₹50,000 of premium coverage at checkout for high-value items." },
      { q: "Is my bag safe during transit?", a: "Every bag is sealed, photographed and documented at pickup, and moved in a dedicated vehicle." },
    ],
  },
  {
    cat: "Pricing", items: [
      { q: "How is pricing calculated?", a: "Route, distance, bag count, weight category and service type. Get an instant quote in the booking form above." },
      { q: "How much can I save vs. airline excess fees?", a: "Most customers save 40–60%. A bag the airline charges ₹5,000 for typically costs ₹1,500–2,500 with Bagdrop." },
      { q: "Do you offer GST invoices for corporate bookings?", a: "Yes — corporate accounts get GST invoices, monthly billing and a dedicated account manager." },
    ],
  },
];

export const FOOTER_COLS = [
  { h: "Services", items: ["Airport Delivery", "Door-to-Door", "Destination Weddings", "Student Relocation", "Corporate Travel", "Excess Baggage"] },
  { h: "Locations", items: CITIES },
  { h: "Company", items: ["About Bagdrop", "Contact Us", "Blog"] },
  { h: "Support", items: ["Contact Us", "FAQ", "WhatsApp Us", "Refund Policy"] },
];

export const WHATSAPP_URL = "https://wa.me/916357115711?text=Hi!%20I%20have%20a%20question%20about%20Bagdrop.";
