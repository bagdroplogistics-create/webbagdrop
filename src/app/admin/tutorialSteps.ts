/** The team tutorial — one real booking followed from the inquiry to the
 *  reconciled payment, step by step, with the exact clicks. The same text
 *  feeds the in-app page (/admin/tutorial), the printable document and the
 *  narration script. Screenshots come from the QA run in
 *  qa-suites (journey, lifecycle, inhouse, desk), copied to /public/tutorial. */
export interface TutorialStep {
  n: number;
  title: string;
  where: string;
  /** what is on screen when you get there */
  see: string;
  /** the clicks, in order */
  do: string[];
  /** what the client receives at this step */
  client: string;
  /** what the system does on its own */
  auto?: string;
  image?: string;
  /** narration for the screen recording (Tara) */
  say: string;
}

export const TUTORIAL: TutorialStep[] = [
  {
    n: 1, title: "Inquiry received", where: "Shipments · Shipments inbox",
    see: "The new request is at the top of the inbox with its reference, traveller, lane, pieces and 'Needs decision'. The client has already had the acknowledgement on WhatsApp and email.",
    do: ["Click the row: the booking opens in the side panel with the journey ladder on phase 1, Received.", "Read the traveller, route, pieces and the price line: 'rate chart' or 'rate on request'."],
    client: "Acknowledgement within the minute: 'we have your request, a specialist reaches you within 15 minutes'.",
    image: "lifecycle-1-cancelled.png",
    say: "Every inquiry lands here, in the Shipments inbox. The side panel shows where it is on the journey, and the first phase is always Received.",
  },
  {
    n: 2, title: "Decide the price", where: "Shipments · Quotes & payments",
    see: "The inquiry queue on the right, the editable quote form on the left. Chart price shown; 'No price, needs a rate' when the lane isn't on the chart.",
    do: ["Click 'Open in quote desk' from the inbox, or click the card in the queue.", "Correct any detail: bags, dates, addresses. The chart re-prices as you type.", "Type a team price only if the lane has no chart price.", "Click 'Accept at ₹… and send payment link'. Use 'Send revised price', 'Ask the customer', 'Hold' or 'Reject' when needed."],
    client: "The approved price with the payment link; or the revised price; or your question.",
    image: "desk-2-open.png",
    say: "The quote desk is where the price is decided. Everything on the form is editable, the chart re-prices live, and Accept sends the client the payment link.",
  },
  {
    n: 3, title: "Payment verified", where: "Finance · Payments to verify",
    see: "The client's proof: UTR, amount, screenshot. A gateway payment is captured on its own and needs nothing here.",
    do: ["Open Finance, then 'Payments to verify'.", "Match the UTR and amount against the bank statement.", "Click 'Verify'. Reject with a note if it doesn't match; the client is asked to resend."],
    client: "'Payment received' with the tax invoice number, then the Move Pass.",
    auto: "The tax invoice is issued the moment payment is verified. Within a minute the LR is issued and the booking moves to Operations as 'To assign pickup'.",
    image: "finance-verify.png",
    say: "Once Finance verifies the payment, the system issues the invoice and the LR by itself. Nobody types an LR number.",
  },
  {
    n: 4, title: "The LR, and editing it", where: "LR & trips",
    see: "The issued LRs table: number, booking, consignee, lane, trip. 'View / Print' opens the consignment note; 'Edit LR' opens the full form.",
    do: ["Click 'Edit LR' when a detail is wrong: consignee, address, pieces, charges.", "Write what changed and why; click 'Save LR changes'. The number stays; the printed note shows the latest version."],
    client: "Nothing; the LR is an internal transport document.",
    image: "inhouse-2-lr-edit.png",
    say: "The LR is editable after issue. The number never changes, and every amendment is logged on the booking.",
  },
  {
    n: 5, title: "Assign the pickup", where: "Operations · Shipments",
    see: "The active shipments table on top; the selected shipment's desk below with the journey ladder, the stages and the 'Next' box.",
    do: ["Click the booking in the table.", "Under 'Legs & assignment', click 'Assign captain'. Pick the captain from the master (or type one), then 'Assign + brief'.", "The WhatsApp brief opens for the captain. Step 'Pickup assigned' turns green with the captain's name under it."],
    client: "The pickup captain's name and phone, with the pickup window.",
    image: "journey-1-to-assign.png",
    say: "Assigning the pickup captain is the first step in Operations. It completes the step and tells the client who is coming.",
  },
  {
    n: 6, title: "Record the pickup", where: "Operations · Next · Picked up & sealed",
    see: "The pickup form: captain, vehicle, time, remarks; then one row per bag with its tag and seal from the printed set.",
    do: ["Click 'Issue tags & seals' if the booking has none yet; print them from 'Bag tags & seals'.", "Pick the captain and vehicle, set the pickup time.", "For each bag: type the weight, attach its photo, click 'Record'.", "When every bag is recorded, draw or paste the client's signature and click 'Record pickup'."],
    client: "'Picked up and sealed', with the Move Pass listing every tag, and the live tracking link.",
    image: "journey-1-to-assign.png",
    say: "Pickup is recorded by the team: tag, seal, weight and photo per bag, and the client's signature. Nothing depends on a phone in the field.",
  },
  {
    n: 7, title: "Origin hub", where: "Operations · Next · In-scan origin hub",
    see: "The hub pick-list from the Hubs master, and the scan box.",
    do: ["Scan or type each tag in the 'Scan' box; the badge counts them.", "Pick the origin hub; click 'Save and complete'."],
    client: "'Reached our hub', naming the hub.",
    say: "At the hub every bag is counted in before anything leaves.",
  },
  {
    n: 8, title: "Line-haul departure and arrival", where: "Operations · Next · Linehaul departed, then Arrived destination",
    see: "The departure form: mode, vendor from the master, LR or AWB, vehicle from the master (driver fills in), expected arrival. Then the arrival form with the seal check.",
    do: ["Fill the departure form; the 'Selected' line reads it back; click 'Save and complete'.", "If anything goes wrong on the road, raise a 'Problem' with the new time: the client is told and sees it on tracking until you 'Clear' it.", "At arrival: scan every tag, pick the destination hub, record the seal check ('Seal broken' asks for the numbers and raises a problem), click 'Save and complete'."],
    client: "'Departed by road, expected at … on …'; any problem with the new time; 'Arrived, delivery is next'.",
    image: "journey-2-linehaul-form.png",
    say: "The middle mile carries the vendor, the vehicle, the driver and the expected arrival, so tracking shows a real ETA.",
  },
  {
    n: 9, title: "Out for delivery", where: "Operations · Legs, then Next · Out for delivery",
    see: "The delivery leg under 'Legs & assignment'; the 'Expected delivery time' field.",
    do: ["Assign the delivery captain.", "Set the expected delivery time; click 'Save and complete'.", "Made a mistake? 'Undo' the latest step with a reason; tracking goes back and the client isn't messaged twice."],
    client: "The delivery captain's name, then 'Out for delivery, expected by …'.",
    image: "journey-3-last-mile.png",
    say: "Out for delivery tells the client who is bringing the bags and when to expect them.",
  },
  {
    n: 10, title: "Record the delivery", where: "Operations · Next · Delivered · POD",
    see: "The delivery form: received by, relation, time, captain, the optional handover photo, remarks.",
    do: ["Type who took the bags and pick the relation.", "Attach the handover photo if the captain sent one.", "Click 'Record delivery'. The POD number, receiver and photo appear on the desk."],
    client: "'Delivered to …'. The tracking link ends.",
    auto: "The line-haul vendor is scored on time; the invoice already went out at payment.",
    image: "journey-4-delivered.png",
    say: "Delivery closes the move with a proof of delivery: who, when, and the photo.",
  },
  {
    n: 11, title: "Invoice and documents", where: "Finance · Invoices, and the booking's event log",
    see: "The tax invoice, the LR, receipts and any credit note listed against the booking.",
    do: ["Open Finance, then 'Invoices' to view or print the tax invoice.", "A change after payment? Open the paid booking on the quote desk and apply it: a top-up falls due, or a credit note is issued."],
    client: "The invoice at payment; a top-up link or a credit note after a change.",
    image: "inhouse-3-amend.png",
    say: "Money follows the booking: the invoice at payment, and a top-up or credit note if the booking changes afterwards.",
  },
  {
    n: 12, title: "Reconcile the payment", where: "Finance · Banking & reconciliation, Gateway (Razorpay)",
    see: "Bank lines and gateway settlements on one side, verified payments on the other.",
    do: ["Upload or paste the bank statement; matched lines turn green.", "Click an unmatched line to pair it with a booking, or mark it for follow-up.", "The gateway reconciliation runs daily; open 'Gateway' for anything it flagged."],
    client: "Nothing; this is the books.",
    image: "finance-recon.png",
    say: "Reconciliation closes the loop: every payment on the books matches a line at the bank or the gateway.",
  },
  {
    n: 13, title: "Cancel and restore", where: "Any booking's journey panel",
    see: "'Cancel booking' on a live booking; 'Restore booking' on a cancelled one, with the stage it was at.",
    do: ["Cancel: write the reason, click 'Cancel and tell the client'.", "Restore: open the Cancelled filter in Shipments (or 'Show cancelled' in Operations), click 'Restore booking'. It comes back exactly where it was."],
    client: "'Cancelled, reason …' and later 'Back on, exactly where it was'.",
    image: "lifecycle-2-restored.png",
    say: "A booking cancelled by mistake is one click from coming back, with its LR, captain and steps intact.",
  },
];
