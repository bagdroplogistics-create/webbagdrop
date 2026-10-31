/** Server-only: Apple Wallet (.pkpass) and Google Wallet ("Save to Google
 *  Wallet" link) versions of the Move Pass. Built and ready; each switches
 *  on only when its keys are set in the environment — nothing is hard-coded.
 *
 *  Apple   APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT (PEM, base64),
 *          APPLE_PASS_KEY (PEM, base64), APPLE_PASS_KEY_PASSPHRASE (optional),
 *          APPLE_WWDR_CERT (Apple WWDR G4 intermediate, PEM, base64)
 *  Google  GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL,
 *          GOOGLE_WALLET_SA_KEY (service-account private key, PEM, base64)
 *  A .pkpass is a ZIP of pass.json + images + manifest.json (SHA-1 of each
 *  file) + signature (detached PKCS#7 over the manifest). */
import { createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import forge from "node-forge";
import { COMPANY } from "./company";
import type { PassView } from "./movePass";

const b64 = (v?: string) => (v ? Buffer.from(v, "base64").toString("utf8") : "");
export const walletConfigured = () => ({
  apple: !!(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PASS_CERT && process.env.APPLE_PASS_KEY && process.env.APPLE_WWDR_CERT),
  google: !!(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_EMAIL && process.env.GOOGLE_WALLET_SA_KEY),
});

const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

/* ---------------- Apple ---------------- */
export function applePassJson(p: PassView, passUrl: string, ids: { passTypeId: string; teamId: string }) {
  return {
    formatVersion: 1,
    passTypeIdentifier: ids.passTypeId, teamIdentifier: ids.teamId,
    serialNumber: p.ref, organizationName: "Bagdrop", description: `Bagdrop Move Pass ${p.ref}`, logoText: "BAGDROP",
    foregroundColor: "rgb(255,255,255)", backgroundColor: "rgb(234,88,12)", labelColor: "rgb(255,237,213)",
    relevantDate: p.pickupDate ? `${p.pickupDate}T06:00:00+05:30` : undefined,
    boardingPass: {
      transitType: "PKTransitTypeGeneric",
      headerFields: [{ key: "pieces", label: "PIECES", value: `${p.pieces}${p.xl ? ` (${p.xl} XL)` : ""}` }],
      primaryFields: [
        { key: "from", label: p.from.toUpperCase(), value: p.fromCode },
        { key: "to", label: p.to.toUpperCase(), value: p.toCode },
      ],
      secondaryFields: [
        { key: "pax", label: "PASSENGER", value: p.name },
        { key: "pickup", label: "PICKUP", value: `${day(p.pickupDate)}${p.slot ? ` · ${p.slot}` : ""}` },
      ],
      auxiliaryFields: [
        { key: "ref", label: "BOOKING", value: p.ref },
        { key: "stage", label: "STATUS", value: p.stage, changeMessage: "Your bags: %@" },
        ...(p.deliveryDate ? [{ key: "by", label: "DELIVERY BY", value: day(p.deliveryDate) }] : []),
      ],
      backFields: [
        { key: "tags", label: "Bag tags", value: p.tags.length ? p.tags.map((t) => `${t.plate}${t.xl ? " XL" : ""}`).join("\n") : "Issued at pickup — your pass updates with every tag number." },
        { key: "pa", label: "Pickup address", value: p.pickAddr || "—" },
        { key: "da", label: "Delivery address", value: p.dropAddr || "—" },
        ...(p.pickupCaptain ? [{ key: "pc", label: "Pickup captain", value: `${p.pickupCaptain.name}${p.pickupCaptain.mobile ? ` · ${p.pickupCaptain.mobile}` : ""}` }] : []),
        ...(p.deliveryCaptain ? [{ key: "dc", label: "Delivery captain", value: `${p.deliveryCaptain.name}${p.deliveryCaptain.mobile ? ` · ${p.deliveryCaptain.mobile}` : ""}` }] : []),
        { key: "link", label: "Live pass", value: passUrl },
        { key: "help", label: "Bagdrop", value: `${COMPANY.phone} · ${COMPANY.email}` },
      ],
    },
    barcodes: [
      { format: "PKBarcodeFormatQR", message: passUrl, messageEncoding: "iso-8859-1", altText: p.ref },
      { format: "PKBarcodeFormatPDF417", message: p.payload, messageEncoding: "iso-8859-1" },
    ],
  };
}

/** Minimal store-only ZIP (no compression) — all a .pkpass needs. */
export function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, f.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + f.data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cd, end]);
}

/** Detached PKCS#7 signature over manifest.json (DER). */
export function signManifest(manifest: Buffer, certPem: string, keyPem: string, wwdrPem: string, passphrase?: string): Buffer {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = passphrase ? forge.pki.decryptRsaPrivateKey(keyPem, passphrase) : forge.pki.privateKeyFromPem(keyPem);
  if (!key) throw new Error("APPLE_PASS_KEY could not be read (wrong passphrase?)");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"));
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(wwdrPem));
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export async function buildPkpass(p: PassView, passUrl: string, creds?: { passTypeId: string; teamId: string; cert: string; key: string; wwdr: string; passphrase?: string }): Promise<Buffer> {
  const c = creds ?? {
    passTypeId: process.env.APPLE_PASS_TYPE_ID!, teamId: process.env.APPLE_TEAM_ID!,
    cert: b64(process.env.APPLE_PASS_CERT), key: b64(process.env.APPLE_PASS_KEY), wwdr: b64(process.env.APPLE_WWDR_CERT),
    passphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
  };
  const pub = path.join(process.cwd(), "public");
  const icon = await readFile(path.join(pub, "icon-192.png"));
  const files: { name: string; data: Buffer }[] = [
    { name: "pass.json", data: Buffer.from(JSON.stringify(applePassJson(p, passUrl, c)), "utf8") },
    { name: "icon.png", data: icon }, { name: "icon@2x.png", data: icon },
    { name: "logo.png", data: icon }, { name: "logo@2x.png", data: icon },
  ];
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(files.map((f) => [f.name, createHash("sha1").update(f.data).digest("hex")]))), "utf8");
  const signature = signManifest(manifest, c.cert, c.key, c.wwdr, c.passphrase);
  return zipStore([...files, { name: "manifest.json", data: manifest }, { name: "signature", data: signature }]);
}

/* ---------------- Google ---------------- */
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
export function googleSaveUrl(p: PassView, passUrl: string, site: string, creds?: { issuer: string; email: string; key: string }): string {
  const c = creds ?? { issuer: process.env.GOOGLE_WALLET_ISSUER_ID!, email: process.env.GOOGLE_WALLET_SA_EMAIL!, key: b64(process.env.GOOGLE_WALLET_SA_KEY) };
  const classId = `${c.issuer}.bagdrop_move_pass`;
  const safeId = p.ref.replace(/[^A-Za-z0-9._-]/g, "_");
  const t = (value: string) => ({ defaultValue: { language: "en", value } });
  const object = {
    id: `${c.issuer}.${safeId}`, classId, state: p.delivered ? "COMPLETED" : "ACTIVE",
    hexBackgroundColor: "#ea580c", logo: { sourceUri: { uri: `${site}/icon-512.png` } },
    cardTitle: t("Bagdrop Move Pass"), header: t(`${p.fromCode} → ${p.toCode}`), subheader: t(`${p.name} · ${p.ref}`),
    textModulesData: [
      { id: "pickup", header: "Pickup", body: `${day(p.pickupDate)}${p.slot ? ` · ${p.slot}` : ""}` },
      { id: "pieces", header: "Pieces", body: `${p.pieces}${p.xl ? ` (${p.xl} XL)` : ""}` },
      { id: "status", header: "Status", body: p.stage },
      { id: "tags", header: "Bag tags", body: p.tags.length ? p.tags.map((x) => `${x.plate}${x.xl ? " XL" : ""}`).join(", ") : "Issued at pickup" },
    ],
    barcode: { type: "QR_CODE", value: passUrl, alternateText: p.ref },
    linksModuleData: { uris: [{ uri: passUrl, description: "Live Move Pass" }] },
  };
  const claims = {
    iss: c.email, aud: "google", typ: "savetowallet", iat: Math.floor(Date.now() / 1000), origins: [site],
    payload: { genericClasses: [{ id: classId }], genericObjects: [object] },
  };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(c.key);
  return `https://pay.google.com/gp/v/save/${unsigned}.${b64url(sig)}`;
}
