import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { inr } from "@/lib/pricing";
import { notify, kickSweep } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** Finance payment verification. A customer-submitted payment only becomes
 *  money once finance verifies it against the bank (statement upload or
 *  manual check). Proof screenshots are served as 2-minute signed links —
 *  the storage bucket is private. Every decision is stamped for audit. */

const BUCKET = "payment-proofs";

type Body = { id?: string; action?: "verify" | "reject" | "proofUrl"; kind?: "full" | "topup"; note?: string; ref?: string };

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const { data } = await sb.from("bookings").select("doc").eq("id", String(b.id ?? "")).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const doc = data.doc as Booking;
  const kind = b.kind === "topup" ? "topup" : "full";
  const target = kind === "topup" ? doc.pay?.topup : doc.pay;
  if (!doc.pay || !target) return NextResponse.json({ error: "NO_PAYMENT" }, { status: 409 });

  if (b.action === "proofUrl") {
    if (!target.proof?.path) return NextResponse.json({ error: "NO_PROOF" }, { status: 404 });
    const s = await sb.storage.from(BUCKET).createSignedUrl(target.proof.path, 120);
    if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
    return NextResponse.json({ url: s.data.signedUrl });
  }

  if (target.status !== "submitted") return NextResponse.json({ error: "NOT_SUBMITTED", detail: "Only a submitted payment can be verified or rejected." }, { status: 409 });
  const note = (b.note ?? "").trim().slice(0, 200);
  const ref = (b.ref ?? "").trim().slice(0, 60);
  const now = new Date().toISOString();
  const to = { name: doc.traveller.name, mobile: doc.traveller.mobile, email: doc.traveller.email };
  const origin = new URL(req.url).origin;
  let next: Booking;

  if (b.action === "verify") {
    if (kind === "full") {
      next = {
        ...doc,
        pay: { ...doc.pay, status: "captured", verifiedAt: now, verifiedBy: "finance", rejectedNote: undefined,
          recon: ref ? { at: now, ref } : doc.pay.recon,
          history: [...(doc.pay.history ?? []), { at: now, amount: doc.pay.amount, kind: "full", utr: doc.pay.utr, verifiedBy: "finance" }] },
        events: [...doc.events, { at: now, by: "admin", text: `✅ Payment ${inr(doc.pay.amount)} VERIFIED by finance against the bank${ref ? ` · bank ref ${ref}` : ""}${note ? ` · ${note}` : ""}` }],
      };
      /* the sweep now sends "payment received", issues the tax invoice and asks for identity */
    } else {
      const amt = doc.pay.topup!.amount;
      next = {
        ...doc,
        pay: { ...doc.pay, amount: doc.pay.amount + amt, topup: null,
          history: [...(doc.pay.history ?? []), { at: now, amount: amt, kind: "topup", utr: doc.pay.topup!.utr, verifiedBy: "finance" }] },
        events: [...doc.events, { at: now, by: "admin", text: `✅ Extra-bags payment ${inr(amt)} VERIFIED by finance${ref ? ` · bank ref ${ref}` : ""}${note ? ` · ${note}` : ""}` }],
      };
      await notify("topup_verified", to, { ref: doc.id, amount: inr(amt) }, `topupok:${doc.id}:${now}`);
    }
  } else if (b.action === "reject") {
    if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Tell the client why it couldn't be verified." }, { status: 400 });
    next = kind === "full"
      ? { ...doc, pay: { ...doc.pay, status: "rejected", rejectedAt: now, rejectedNote: note }, events: [...doc.events, { at: now, by: "admin", text: `✖ Payment proof REJECTED by finance · ${note}` }] }
      : { ...doc, pay: { ...doc.pay, topup: { ...doc.pay.topup!, status: "rejected", rejectedNote: note } }, events: [...doc.events, { at: now, by: "admin", text: `✖ Extra-bags payment proof REJECTED by finance · ${note}` }] };
    await notify("payment_rejected", to, { ref: doc.id, note, dashboard: `${origin}/account` }, `payrej:${doc.id}:${kind}:${now}`);
  } else {
    return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }

  const up = await saveOrThrow(sb, next);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  kickSweep();
  return NextResponse.json({ ok: true, booking: next });
}

export const POST = retryOnConflict(handlePOST);
