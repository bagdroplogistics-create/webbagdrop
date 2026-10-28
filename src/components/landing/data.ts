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

export type UseCase = { problem: string; solution: string; icon: string };
export const USE_CASES: UseCase[] = [
  { problem: "Over your airline allowance", solution: "Excess baggage", icon: "plane" },
  { problem: "Landing in a new city", solution: "Airport delivery", icon: "landing" },
  { problem: "Need an early hotel check-in", solution: "Hotel delivery", icon: "hotel" },
  { problem: "Long train journey ahead", solution: "Railway station drop", icon: "train" },
  { problem: "Family cruise departure", solution: "Cruise baggage", icon: "cruise" },
  { problem: "Moving city to city", solution: "Door-to-door", icon: "home" },
  { problem: "Destination wedding", solution: "Wedding logistics", icon: "wedding" },
  { problem: "Moving abroad for study", solution: "Student relocation", icon: "graduate" },
];

export type Pain = { big: string; pain: string; fix: string };
export const PAINS: Pain[] = [
  { big: "₹3,000–8,000", pain: "Airline excess-baggage fees, every trip", fix: "Save 40–60% with Bagdrop" },
  { big: "Queues", pain: "Trolleys and queues at every terminal", fix: "Walk out empty-handed" },
  { big: "Stairs", pain: "Platforms, stairs and coach racks", fix: "Board with just a day bag" },
  { big: "Hands full", pain: "Kids, parents and wedding trunks to manage", fix: "We carry, you travel" },
];

export type Solution = { title: string; icon: string; tag?: string; image?: string };
export const SOLUTIONS: Solution[] = [
  { title: "Airport Delivery", icon: "plane", tag: "Most popular" },
  { title: "Door-to-Door", icon: "home" },
  { title: "Hotel Delivery", icon: "hotel" },
  { title: "Railway Station", icon: "train" },
  { title: "Cruise Baggage", icon: "cruise" },
  { title: "Excess Baggage", icon: "landing", tag: "Save 40–60%" },
  { title: "Destination Weddings", icon: "wedding", tag: "White-glove", image: "/images/wedding-slide.jpg" },
  { title: "Student Relocation", icon: "graduate", image: "/images/student-slide.jpg" },
  { title: "Corporate Travel", icon: "briefcase", tag: "GST invoices" },
  { title: "Group Bookings", icon: "group", tag: "Up to 30 bags" },
  { title: "Sports & Oversized", icon: "globe" },
  { title: "Baggage Pickup", icon: "box" },
];

export const PROCESS_STEPS = [
  { n: "01", t: "Book", d: "Choose your route, bag count and pickup slot. Takes under 2 minutes." },
  { n: "02", t: "Pickup", d: "Our team arrives at your door in the confirmed slot — sealed and photographed." },
  { n: "03", t: "Updates", d: "WhatsApp and email updates at every stage — pickup, in transit, delivered." },
  { n: "04", t: "Delivery", d: "Your bags arrive at the destination, before you do. Always insured." },
];

export type HandoverRow = { time: string; code: string; service: string; from: string; to: string; icon: string; steps: string[] };
export const HANDOVERS: HandoverRow[] = [
  { time: "06:40", code: "BD 101", service: "Airport", from: "Arrivals · BOM T2", to: "Your hotel or home", icon: "plane", steps: ["Baggage belt", "Bagdrop handover at arrivals", "Your taxi, bags already gone ahead"] },
  { time: "08:15", code: "BD 204", service: "Excess baggage", from: "Your door", to: "Destination city", icon: "landing", steps: ["Pickup at your door", "Skip the excess-fee counter", "Delivered to destination city"] },
  { time: "10:30", code: "BD 318", service: "Railway station", from: "Your door", to: "Arrival station", icon: "train", steps: ["Pickup before you leave", "Bags travel separately", "Waiting at the arrival forecourt"] },
  { time: "12:05", code: "BD 422", service: "Hotel", from: "Airport or home", to: "Hotel front desk", icon: "hotel", steps: ["Coordinated with front desk", "Bags reach ahead of you", "Handed over at check-in"] },
  { time: "14:50", code: "BD 509", service: "Cruise", from: "Your door", to: "Cruise terminal", icon: "cruise", steps: ["Pickup from home", "Sealed and photographed", "Delivered to the terminal baggage hall"] },
  { time: "17:20", code: "BD 616", service: "Door-to-Door", from: "Goa doorstep", to: "Mumbai home", icon: "home", steps: ["Pickup at origin door", "In transit by road", "Delivered at destination door"] },
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
