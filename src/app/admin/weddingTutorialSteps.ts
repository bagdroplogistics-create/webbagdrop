/** Weddings & events tutorial — three screens, one record:
 *   the guest's Y2K desk (/e/y2k) and My bags (/e/y2k/my),
 *   BAGDROP OS → Weddings & events (the team),
 *   the event company's desk at /event (the planner).
 *  Followed on one real family. Same shape as tutorialSteps.ts. */
import type { TutorialStep } from "./tutorialSteps";

export const WHO = {
  guest: "Guest · Y2K desk and My bags",
  team: "Bagdrop team · BAGDROP OS",
  planner: "Event company · /event",
} as const;

export interface WeddingStep extends TutorialStep { who: keyof typeof WHO }

export const WEDDING_TUTORIAL: WeddingStep[] = [
  {
    n: 1, who: "team", title: "Set the event up", where: "BAGDROP OS → Weddings & events → the event",
    see: "The event's settings: dates, venue, booking close date, the landing page and wedding desk links, Commercials, and 'Event company' with its people.",
    do: ["Open Weddings & events and click the event (Y2K-WED). Seed the Y2K event from the button if the list is empty.", "Under Commercials click 'Add or edit': who pays (hosts or families), direction, sectors with the rate per bag, oversize add-on, minimum bags, discounts, deposit. Save.", "Under Event company type the company name and add each planner with name and mobile. Save. They sign in at /event with a WhatsApp code to that mobile; remove a number and that person is locked out at once.", "Share the links: the landing page for guests, the wedding desk (/e/y2k) for bookings, 'Event desk login' (/event) for the planners, and the Ops desk (/e/y2k?ops=1) for the hub team on site."],
    client: "Nothing yet. The hosts and planners get their links from you.",
    image: "wed-2-os-event.png",
    say: "Everything about the wedding lives on one event record: the dates, the commercials, the planners who may sign in, and the links every side uses.",
  },
  {
    n: 2, who: "guest", title: "A family books on the Y2K desk", where: "/e/y2k, 'Book luggage pickup'",
    see: "Two tabs. Booking: the lead's name, mobile and email, the pickup address with lift or stairs, each bag as small or large with its weight band, colour and declared value, and 'Add member' for the rest of the family. Return: tick which bags come back, with one return date and address for the family. Then Confirm.",
    do: ["Fill the lead's details and address; add each bag; add members and their bags.", "On Return, tick the bags coming back and set the date.", "Confirm. The done view shows each bag's tag code; the same code is used for the return."],
    client: "'Request received, Bagdrop is reviewing it'. No price: the hosts are covering it.",
    image: "wed-1-y2k-form.png",
    say: "Guests book the whole family in one go, with a tag code per bag that stays the same on the way back.",
  },
  {
    n: 3, who: "team", title: "Confirm the family", where: "BAGDROP OS → Weddings & events → the family, or Shipments",
    see: "The family under the event: guests, bags, side, 'Awaiting approval'. The journey panel on phase 1, Received.",
    do: ["Open the family card; check guests, bags and pickup date.", "Click 'Confirm booking' (in Shipments) or approve from the quote desk. Hosts pay, so there is no price and no payment link.", "The family moves to Confirmed; because the hosts are billed, it counts as billed at once and the LR is issued automatically."],
    client: "'Confirmed by Bagdrop. The hosts are covering this, so there is nothing to pay.'",
    auto: "LR issued; the family appears in Operations as 'To assign pickup'. The event's commercials drive the hosts' bill.",
    image: "wed-2-os-event.png",
    say: "Confirming a family takes one click. The hosts' commercials, not the guest, decide the money.",
  },
  {
    n: 4, who: "guest", title: "My bags", where: "/e/y2k/my",
    see: "After a WhatsApp code to the mobile the family booked with: the family's booking, its status, every bag with its tag code and QR, the stage of each bag, the room once it is set, and the messages with the team.",
    do: ["Guests sign in with the code and see only their own family.", "They can send the team a question from here ('Can both bags go to room 214?').", "They cannot change a saved booking; the team does that in BAGDROP OS."],
    client: "This is the client's screen. Every reply from the team or the planner also reaches them on WhatsApp.",
    image: "wed-3-my-bags.png",
    say: "My bags is the guest's window on the same record: tags, stages, rooms and messages.",
  },
  {
    n: 5, who: "planner", title: "The planner's event desk", where: "/event",
    see: "After a WhatsApp code to a listed mobile: the company name, the event, counts of families, bags, families awaiting approval, guests without a room, new messages. Four tabs: Messages, Rooms, Returns, Tags.",
    do: ["Messages: read each family's questions and reply; the reply reaches the guest on WhatsApp and in My bags.", "Rooms: set a room per guest (and a room per bag when a bag goes elsewhere), or upload the rooming list as CSV and apply the matches.", "Tags: print every tag, only new ones, or only the ones whose room changed. Tags carry the room.", "Returns: scan or type a tag as a return bag comes in, note its condition, accept."],
    client: "The planner's replies on WhatsApp; the room on each tag.",
    image: "wed-4-planner-rooms.png",
    say: "The event company works on the same desk the Bagdrop team uses, scoped to its own event. Approving, pricing and cancelling stay with Bagdrop.",
  },
  {
    n: 6, who: "planner", title: "Messages, both ways", where: "/event → Messages, and BAGDROP OS → the family → Messages",
    see: "The guest's question with 'new' on it; the reply box.",
    do: ["Type the reply and send. The person's name goes on it.", "The Bagdrop team sees the same thread under the family in Weddings & events and can reply too."],
    client: "The reply on WhatsApp with a link back to My bags.",
    image: "wed-5-planner-messages.png",
    say: "One thread per family, shared by the guest, the planner and Bagdrop.",
  },
  {
    n: 7, who: "team", title: "Move the bags", where: "BAGDROP OS → Operations (and Weddings & events → the family's bag stages)",
    see: "The family in Operations like any booking: pickup, hub, line-haul, arrival, out for delivery, delivered. Under the family in Weddings & events, each bag's stage dropdown and the printed tags.",
    do: ["Run the move in Operations as in the main tutorial: assign the pickup captain, record the pickup with proof, the hub, the line-haul, the arrival, out for delivery, the delivery to the room or the hotel desk.", "For a quick per-bag update, change the stage on the bag's row under the family; it saves straight away.", "On site, open the Ops desk (/e/y2k?ops=1) signed in as admin: the whole manifest by family with every bag's stage."],
    client: "A message at every step and live tracking; My bags shows each bag's stage.",
    image: "wed-7-manifest.png",
    say: "Wedding bags move through the same operations desk, and the on-site manifest shows every family at a glance.",
  },
  {
    n: 8, who: "guest", title: "What the guest sees as it moves", where: "/e/y2k/my",
    see: "Each bag's stage updates as the team records it; the room set by the planner; the return date for bags going back.",
    do: ["Nothing to do: the page refreshes itself."],
    client: "'Picked up', 'Reached our hub', 'Delivered to room 214' and so on, on WhatsApp too.",
    image: "wed-6-my-bags-moving.png",
    say: "Whatever the team records, the guest sees within seconds.",
  },
  {
    n: 9, who: "planner", title: "Return bags and the hosts' bill", where: "/event → Returns; BAGDROP OS → Weddings & events → Commercials",
    see: "Returns: bags booked to come back, accepted so far. Commercials: the rate per bag and sectors that make up the hosts' bill.",
    do: ["As each return bag arrives at the desk, scan its tag (same code as the way out), note the condition, accept. The guest's My bags shows it accepted.", "After the event, the hosts' bill follows the commercials: families times bags times the sector rate, with oversize add-ons and any discount. Finance issues it to the host account."],
    client: "'Return bag accepted' for each bag; nothing to pay.",
    say: "Returns use the same tags, and the hosts settle one bill built from the event's commercials.",
  },
];
