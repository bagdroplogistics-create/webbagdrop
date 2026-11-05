/** BAGDROP OS access: the modules and key actions a user can be given, the
 *  department templates that pre-tick them, and which permission each
 *  /api/admin route needs. Shared by the server (proxy.ts enforces it on
 *  every request) and the Users screen (the checkbox grid). No node-only
 *  imports here. The owner's emergency admin key has every permission. */

export const MODULES = [
  { key: "cmd", name: "Command centre", group: "Operate" },
  { key: "ship", name: "Shipments · quotes & payments", group: "Operate" },
  { key: "lr", name: "LR & trips", group: "Operate" },
  { key: "opsx", name: "Operations", group: "Operate" },
  { key: "live", name: "Live tracking", group: "Operate" },
  { key: "insp", name: "Tracking inspector", group: "Operate" },
  { key: "exc", name: "Exceptions", group: "Operate" },
  { key: "wed", name: "Weddings & events", group: "Operate" },
  { key: "evt", name: "Bulk & manifest tools", group: "Operate" },
  { key: "drv", name: "Drivers", group: "Operate" },
  { key: "flt", name: "Flights", group: "Operate" },
  { key: "apt", name: "Airport desk · T2 POC", group: "Operate" },
  { key: "cap", name: "Capacity & roster", group: "Operate" },
  { key: "cli", name: "Clients · master", group: "Commerce" },
  { key: "crm", name: "CRM & follow-ups", group: "Commerce" },
  { key: "ads", name: "Lead import · Ads", group: "Commerce" },
  { key: "price", name: "Pricing engine", group: "Commerce" },
  { key: "id", name: "Identity & compliance", group: "Commerce" },
  { key: "fin", name: "Finance", group: "Commerce" },
  { key: "part", name: "Partners & API", group: "Commerce" },
  { key: "dash", name: "Executive boards", group: "Intelligence" },
  { key: "rep", name: "Reports & MIS", group: "Intelligence" },
  { key: "rules", name: "Rules & notifications", group: "Intelligence" },
  { key: "integ", name: "Integrations", group: "Platform" },
  { key: "sec", name: "Security & audit", group: "Platform" },
  { key: "data", name: "Data & privacy", group: "Platform" },
] as const;
export type ModKey = (typeof MODULES)[number]["key"];

export const ACTIONS = [
  { key: "approve_bookings", name: "Approve or decline bookings", hint: "Bookings on routes with instant booking OFF wait for this" },
  { key: "publish_prices", name: "Publish prices", hint: "Make a price draft live, schedule it, roll back, instant booking switches" },
  { key: "approve_prices", name: "Approve price changes", hint: "The second person when two-person publish is on" },
  { key: "verify_payments", name: "Verify payments and refunds", hint: "Finance → Payments to verify" },
  { key: "export", name: "Export data", hint: "Download client lists and reports" },
  { key: "manage_users", name: "Manage users", hint: "Create, edit, reset passwords, disable and delete users" },
] as const;
export type ActKey = (typeof ACTIONS)[number]["key"];

/** A permission string: "<module>.view", "<module>.edit" or "act.<action>". Edit includes view. */
export type Perm = `${ModKey}.view` | `${ModKey}.edit` | `act.${ActKey}`;

const all = (lvl: "view" | "edit") => MODULES.map((m) => `${m.key}.${lvl}` as Perm);
const mods = (lvl: "view" | "edit", ...k: ModKey[]) => k.map((m) => `${m}.${lvl}` as Perm);

const withViews = (ps: Perm[]): Perm[] => [...new Set(ps.flatMap((p) => (p.endsWith(".edit") ? [p, p.replace(/\.edit$/, ".view") as Perm] : [p])))];

export const DEPARTMENTS: { key: string; name: string; perms: Perm[] }[] = ([
  { key: "management", name: "Management", perms: [...all("edit"), ...ACTIONS.map((a) => `act.${a.key}` as Perm)] },
  { key: "operations", name: "Operations", perms: [...mods("edit", "cmd", "ship", "lr", "opsx", "live", "insp", "exc", "wed", "evt", "drv", "flt", "apt", "cap", "id"), ...mods("view", "cli", "crm", "rep"), "act.approve_bookings"] },
  { key: "hub", name: "Hub staff", perms: [...mods("edit", "ship", "lr", "live", "exc", "apt"), ...mods("view", "cmd", "opsx", "insp")] },
  { key: "sales", name: "Sales", perms: [...mods("edit", "ship", "cli", "crm", "ads", "wed", "evt", "part"), ...mods("view", "cmd", "price", "rep"), "act.approve_bookings", "act.export"] },
  { key: "finance", name: "Finance", perms: [...mods("edit", "fin"), ...mods("view", "cmd", "ship", "price", "cli", "part", "rep", "dash"), "act.verify_payments", "act.export"] },
  { key: "auditor", name: "Auditor", perms: [...all("view")] },
  { key: "custom", name: "Custom", perms: [] },
] as { key: string; name: string; perms: Perm[] }[]).map((d) => ({ ...d, perms: withViews(d.perms) }));

export const PERM_KEYS: Perm[] = [...all("view"), ...all("edit"), ...ACTIONS.map((a) => `act.${a.key}` as Perm)];
export const isPerm = (p: string): p is Perm => (PERM_KEYS as string[]).includes(p);

/** "*" is the owner's emergency key: everything. */
export type Grants = Perm[] | "*";
export function can(g: Grants | null | undefined, p: Perm): boolean {
  if (!g) return false;
  if (g === "*") return true;
  if (g.includes(p)) return true;
  if (p.endsWith(".view")) return g.includes(p.replace(/\.view$/, ".edit") as Perm);
  return false;
}
export const canView = (g: Grants | null | undefined, m: ModKey) => can(g, `${m}.view`);

/* ---------------- which permission each /api/admin route needs ---------------- */
/** Modules whose screens change bookings through POST /api/admin/bookings. */
const BOOKING_EDITORS: ModKey[] = ["ship", "lr", "opsx", "live", "insp", "exc", "wed", "evt", "drv", "cap", "id"];
/** Data many screens read (Command centre, Shipments and Reports pull from
 *  several modules); any signed-in user may READ it. Changing it still needs
 *  the module's Edit box. */
const SHARED_READS = ["bookings", "metrics", "trips", "ops", "events", "flights", "tracking", "inquiries", "rules", "automation",
  "production-leads", "agents", "inspector", "crm", "finance"];
/** …except these reads, which stay behind their own boxes. */
const PRIVATE_READS = ["finance/gateway", "finance/recon", "finance/doc", "clients"];
const ROUTE_MODULE: Record<string, ModKey> = {
  agents: "part", airport: "apt", automation: "rules", "board-link": "dash", clients: "cli", crm: "crm", events: "wed", finance: "fin", payments: "fin",
  flights: "flt", identity: "id", inquiries: "ship", inquiry: "ship", inspector: "insp", leads: "ads", "production-leads": "ads", metrics: "dash", moves: "opsx",
  ops: "opsx", lifecycle: "ship", lr: "lr", "payment-link": "ship", pricing: "price", quotes: "ship", rules: "rules", tags: "lr", tracking: "live", trips: "lr",
  "wedding-ops": "wed", "wedding-tags": "wed", audit: "sec",
};

export type Need = { ok: true } | { ok: false; need: string };
/** What a request to /api/admin/<...> needs. Finer checks (publish prices,
 *  approve prices, verify payments) happen inside those routes. */
export function apiNeed(g: Grants, pathname: string, method: string, search = ""): Need {
  const seg = pathname.replace(/^\/api\/admin\/?/, "").split("/")[0] ?? "";
  const read = method === "GET" || method === "HEAD";
  const deny = (need: string): Need => ({ ok: false, need });
  if (g === "*" || seg === "login" || seg === "me") return { ok: true };
  if (seg === "users") return can(g, "act.manage_users") ? { ok: true } : deny("Manage users");
  if (seg === "decision") return can(g, "act.approve_bookings") ? { ok: true } : deny("Approve or decline bookings");
  if (seg === "clients" && read && /format=csv|export/.test(search) && !can(g, "act.export")) return deny("Export data");
  if (seg === "bookings" && !read) return BOOKING_EDITORS.some((m) => can(g, `${m}.edit`)) ? { ok: true } : deny("Edit on an operations module");
  const sub = pathname.replace(/^\/api\/admin\/?/, "");
  if (read && SHARED_READS.includes(seg) && !PRIVATE_READS.some((x) => sub === x || sub.startsWith(x + "/"))) return { ok: true };
  const m = ROUTE_MODULE[seg];
  if (!m) return deny("Management access");
  const name = MODULES.find((x) => x.key === m)!.name;
  return can(g, `${m}.${read ? "view" : "edit"}`) ? { ok: true } : deny(`${read ? "View" : "Edit"} on ${name}`);
}

/** The signed-in person, as proxy.ts hands it to route handlers. */
export interface Actor { id: string; name: string; owner: boolean; grants: Grants; mustChange?: boolean }
export const ACTOR_HEADER = "x-bagdrop-actor";
