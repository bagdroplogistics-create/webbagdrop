/* Bagdrop platform configuration.
   Leave url/anonKey empty to run in local demo mode (everything works in this
   browser, synced across tabs). Paste your Supabase project's URL and ANON key
   (never the service-role key) to go live. Use the Mumbai (ap-south-1) region. */
window.BAGDROP_CONFIG = {
  company: {
    name: "BAGDROP LOGISTICS SOLUTIONS PRIVATE LIMITED",
    tagline: "EXCESS BAGGAGE & DOOR-TO-DOOR LUGGAGE DELIVERY ACROSS INDIA",
    address: "302, 3rd Floor, Ananta Stallion, Sevasi Sindhrot Road, B/S Sears Tower, Vadodara, Gujarat \u2013 391101",
    phone: "+91 63 5711 5711 / +91 63 5733 5733",
    email: "info@bagdrop.co",
    web: "www.bagdrop.co",
    gstin: "24AAACC9320N2ZL",
    pan: "AAACC9320N",
    sac: "9965 \u00b7 Goods transport"
  },
  supabase: {
    url: "",      // e.g. "https://xxxx.supabase.co"
    anonKey: ""   // the public anon key only
  },
  ai: {
    /* Optional: a Supabase Edge Function URL that proxies the Claude API
       (claude-sonnet-5-5). When set, free-form copilot questions are answered
       by Claude with a live-data digest; the built-in analyst handles the
       operational intents either way. Never put an API key here. */
    endpoint: ""
  },
  whatsapp: "+91 98765 00000",
  /* Ops passcode: required in the admin panel to override a master rate or
     apply a discount on a quote. Internal only — never shown to customers.
     In production this moves to per-user roles in Supabase Auth. */
  opsPasscode: "2026",
  /* Payment collection details shared with a quote (shown in the WhatsApp
     draft and on the quote page until the gateway keys are wired). */
  payments: {
    upi: "bagdrop@icici",
    bank: "BAGDROP LOGISTICS PVT LTD · HDFC Bank · A/C 50200012345678 · IFSC HDFC0000123",
    gst: "24AAACC9320N2ZL"
  },
  gstRate: 0.05  /* 5% GTA transport rate — never 18% */,
  minPieces: 2,
  rateFloor: 2500
};
