/** The pre-pickup indemnity bond, approved by the client on 2026-10-30
 *  (team-review/INDEMNITY-FORM-DRAFT.md). One source for the signing page,
 *  the server check and the hash stored with every signature — change the
 *  text only together with INDEMNITY_VERSION, and have counsel review it. */

export const INDEMNITY_VERSION = "2026-10-30.1";

export interface BondItem { id: string; text: string; optional?: boolean }
export interface BondGroup { id: string; title: string; law?: string; highlight?: boolean; items: string[] }

/** Part A — declaration of contents */
export const DECLARATIONS: BondItem[] = [
  { id: "a.packed", text: "I packed these bags myself (or they were packed in my presence) and I know everything inside them." },
  { id: "a.own", text: "The bags contain only my own or my family's personal belongings. Nothing was handed to me by anyone else to carry." },
  { id: "a.screening", text: "I agree to security screening and X-ray, and that authorised officials (CISF, BCAS, airline, RPF, police or customs) may open and inspect the bags, in my absence if needed." },
  { id: "a.fragile", text: "I have declared below every fragile item, and every electronic item or watch worth more than ₹25,000, with its approximate value (leave blank if none).", optional: true },
];

/** Part B — prohibited and restricted items: one box per group, "My bags do NOT contain…" */
export const PROHIBITED: BondGroup[] = [
  {
    id: "b.liquor", highlight: true,
    title: "Liquor or alcohol of any kind",
    law: "Gujarat Prohibition Act 1949 · Bihar Prohibition and Excise Act 2016 · Nagaland Liquor Total Prohibition Act 1989 · Mizoram Liquor (Prohibition) Act 2019 · Lakshadweep · state excise acts",
    items: [
      "No beer, wine, spirits, home-brew, or alcohol-based food or chocolates — sealed or open.",
      "Possessing or transporting liquor in or through Gujarat without a permit is a criminal offence. Our home base is Vadodara, so every Gujarat pickup and drop is covered.",
      "Bagdrop carries no alcohol on any route. Bags found with liquor are held and handed to the authorities, and the booking is cancelled without a refund.",
    ],
  },
  {
    id: "b.explosives", title: "Explosives, fireworks and flammables",
    law: "Explosives Act 1884 · Explosive Substances Act 1908 · Petroleum Act 1934 · Gas Cylinder Rules 2016 · BCAS prohibited-items list",
    items: [
      "No fireworks, crackers, flares, gunpowder or detonators.",
      "No petrol, diesel, kerosene, lighter fluid, thinners, paints or camping-stove fuel.",
      "No gas cylinders, butane or LPG canisters, and no aerosols other than small personal toiletries.",
      "No lighters or matchboxes inside bags going to the airport.",
    ],
  },
  {
    id: "b.weapons", title: "Weapons",
    law: "Arms Act 1959 · Aircraft Rules 1937, rule 8",
    items: [
      "No firearms, ammunition, air guns, or replica or toy guns.",
      "No swords, daggers, long-bladed knives, martial-arts weapons, stun guns or pepper spray.",
    ],
  },
  {
    id: "b.batteries", title: "Batteries and electronics (airport bags)",
    law: "DGCA / IATA dangerous-goods rules · BCAS",
    items: [
      "No power banks, spare lithium batteries, or e-cigarettes / vapes in checked bags — these travel in the cabin with the passenger.",
      "Laptops and phones in the bags are switched off and protected from switching on by accident.",
    ],
  },
  {
    id: "b.hazardous", title: "Corrosive, toxic and hazardous items",
    law: "Aircraft (Carriage of Dangerous Goods) Rules 2003 · Railways Act 1989, ss. 67, 164–165 · Carriage by Road Act 2007, s. 8 · Central Motor Vehicles Rules 1989, rr. 129–137",
    items: [
      "No acids, bleach, mercury (including mercury thermometers), pesticides, poisons or radioactive material.",
      "No dry ice, strong magnets or compressed gases.",
    ],
  },
  {
    id: "b.narcotics", title: "Narcotics and medicines",
    law: "NDPS Act 1985 · Drugs and Cosmetics Act 1940",
    items: [
      "No narcotic or psychotropic substances, cannabis or cannabis products, including edibles.",
      "Prescription medicines only in personal quantities, with the prescription inside the bag.",
    ],
  },
  {
    id: "b.wildlife", title: "Wildlife, plants and protected goods",
    law: "Wild Life (Protection) Act 1972 · Antiquities and Art Treasures Act 1972",
    items: [
      "No live animals or birds, and no ivory, skins, horns, shells, feathers or other wildlife products.",
      "No antiquities over 100 years old.",
    ],
  },
  {
    id: "b.illegal", title: "Illegal, counterfeit and restricted goods",
    law: "Bharatiya Nyaya Sanhita 2023 · Customs Act 1962",
    items: [
      "No counterfeit currency, fake branded goods, pirated media or obscene material.",
      "For international guests: nothing restricted or prohibited under the Customs Act.",
    ],
  },
  {
    id: "b.valuables", title: "Valuables Bagdrop does not carry",
    law: "Bagdrop policy",
    items: [
      "No cash, gold, bullion, jewellery, passports, cheque books or other negotiable documents — carry these yourself.",
      "Electronics and watches worth more than ₹25,000 are declared in Part A.",
    ],
  },
  {
    id: "b.perishables", title: "Perishables",
    items: ["No food that can spoil, and no raw meat, fish or dairy. Liquids are sealed against leaks."],
  },
];

/** Part C — indemnity */
export const UNDERTAKINGS: BondItem[] = [
  { id: "c.indemnify", text: "I take full responsibility for what is inside my bags and will indemnify Bagdrop, its partners, drivers and the carriers it uses against any fine, penalty, seizure, legal action, loss or damage caused by an undeclared or prohibited item." },
  { id: "c.refuse", text: "Bagdrop may refuse, hold, or hand over to the authorities any bag suspected of containing a prohibited item. In that case no refund is due." },
  { id: "c.liability", text: "Bagdrop's liability for loss or damage is limited as stated in its Terms of Carriage, under the Carriage by Road Act 2007 and the Railways Act 1989 as applicable." },
  { id: "c.consent", text: "My identity document is used only to confirm who I am, with my consent (Aadhaar Act 2016, s. 8). Bagdrop stores only the last four characters, and handles my data under the Digital Personal Data Protection Act 2023." },
];

export const REQUIRED_IDS: string[] = [
  ...DECLARATIONS.filter((d) => !d.optional).map((d) => d.id),
  ...PROHIBITED.map((g) => g.id),
  ...UNDERTAKINGS.map((u) => u.id),
];

/** The exact text that is agreed — hashed and stored with each signature. */
export function bondText(): string {
  return [
    `Bagdrop indemnity bond v${INDEMNITY_VERSION}`,
    "A. Declaration of contents", ...DECLARATIONS.map((d) => `[${d.id}] ${d.text}`),
    "B. My bags do NOT contain", ...PROHIBITED.map((g) => `[${g.id}] ${g.title}${g.law ? ` (${g.law})` : ""}: ${g.items.join(" ")}`),
    "C. Indemnity", ...UNDERTAKINGS.map((u) => `[${u.id}] ${u.text}`),
  ].join("\n");
}

/** Verhoeff checksum — every genuine 12-digit Aadhaar number passes it. */
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function validAadhaar(raw: string): boolean {
  const n = (raw ?? "").replace(/\s|-/g, "");
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split("").reverse().forEach((ch, i) => { c = D[c][P[i % 8][Number(ch)]]; });
  return c === 0;
}
