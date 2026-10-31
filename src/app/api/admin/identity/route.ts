import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { kickSweep, notify } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** Identity & compliance desk actions for staff — every one stamped on the
 *  booking's event log for audit.
 *   unlock      clear an Aadhaar OTP lock-out (after speaking to the client)
 *   docUrl      2-minute signed link to an international guest's document
 *   approveDocs passport + visa checked by hand → the guest may sign
 *   rejectDocs  with a reason the guest sees → they re-upload
 *   remind      re-send the signing link to the client */
const BUCKET = "identity-docs";
type Body = { action?: string; id?: string; note?: string; path?: string };

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const { data } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const doc = data.doc as Booking;
  const note = (b.note ?? "").trim().slice(0, 200);
  const now = new Date().toISOString();
  const to = { name: doc.traveller.name, mobile: doc.traveller.mobile, email: doc.traveller.email };
  const save = async (next: Booking) => {
    const up = await saveOrThrow(sb, next);
    return up.error ? NextResponse.json({ error: up.error.message }, { status: 500 }) : null;
  };

  switch (b.action) {
    case "unlock": {
      const admin = { ...(doc.admin as Record<string, unknown>) };
      delete admin.aadhaarLocked;
      delete admin.aadhaarAttempts;
      const fail = await save({ ...doc, admin, events: [...doc.events, { at: now, by: "admin", text: `Aadhaar verification UNLOCKED by staff${note ? ` · ${note}` : ""} — customer may retry` }] });
      if (fail) return fail;
      await notify("kyc_issue", to, { ref: doc.id, note: "Your verification is unlocked — you can sign the bond again now.", link: `/verify/${doc.id}` }, `kycunlock:${doc.id}:${now}`);
      return NextResponse.json({ ok: true });
    }
    case "docUrl": {
      const ok = (doc.kyc?.docs ?? []).some((d) => d.path === b.path);
      if (!ok || !b.path) return NextResponse.json({ error: "NO_DOC" }, { status: 404 });
      const s = await sb.storage.from(BUCKET).createSignedUrl(b.path, 120);
      if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
      return NextResponse.json({ url: s.data.signedUrl });
    }
    case "approveDocs":
    case "rejectDocs": {
      if (doc.kyc?.kind !== "international" || doc.kyc.status !== "docs_submitted") return NextResponse.json({ error: "NOTHING_TO_REVIEW" }, { status: 409 });
      const approve = b.action === "approveDocs";
      if (!approve && !note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Tell the guest what to fix." }, { status: 400 });
      const fail = await save({
        ...doc,
        kyc: { ...doc.kyc, status: approve ? "docs_approved" : "docs_rejected", note: approve ? undefined : note, reviewedAt: now, reviewedBy: "compliance" },
        events: [...doc.events, { at: now, by: "admin", text: approve ? `🛂 Passport + visa APPROVED by compliance${note ? ` · ${note}` : ""} — guest may sign the bond` : `🛂 Documents REJECTED by compliance · ${note}` }],
      });
      if (fail) return fail;
      await notify("kyc_issue", to, {
        ref: doc.id, link: `/verify/${doc.id}`,
        note: approve ? "Your documents are approved. Please sign the indemnity bond to release your pickup." : `We couldn't verify your documents: ${note}. Please re-upload them.`,
      }, `kycreview:${doc.id}:${now}`);
      kickSweep();
      return NextResponse.json({ ok: true });
    }
    case "remind": {
      if (doc.identity?.ok) return NextResponse.json({ error: "ALREADY_VERIFIED" }, { status: 409 });
      await notify("kyc_due", to, { ref: doc.id, lane: `${doc.from} → ${doc.to}`, date: doc.date, link: `/verify/${doc.id}` }, `kycremind:${doc.id}:${now}`);
      const fail = await save({ ...doc, events: [...doc.events, { at: now, by: "admin", text: "Signing reminder re-sent to the client by compliance" }] });
      if (fail) return fail;
      kickSweep();
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

export const POST = retryOnConflict(handlePOST);
