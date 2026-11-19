import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { normalizeMobile } from "@/lib/waStore";

/** Stages a file (an international client's quotation PDF, a photo, etc.)
 *  for sending from Live Conversations — upload only, nothing is sent to
 *  the customer yet. The PATCH "reply" action on the parent route does the
 *  actual send, once the admin has typed an optional caption and clicked
 *  Send. Same private "wa-media" Storage bucket inbound attachments use,
 *  under an "out/" prefix so the two directions never collide. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const id = normalizeMobile((await params).id);

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "BAD_FORM" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  // WhatsApp's own document size cap (100MB) is far beyond anything a quotation/photo needs —
  // capped here at 16MB to keep this a quick synchronous upload, not a reason to raise it blindly.
  if (file.size > 16 * 1024 * 1024) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
  const path = `out/${id}/${Date.now()}-${safeName}`;
  await sb.storage.createBucket("wa-media", { public: false }).catch(() => null);
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await sb.storage.from("wa-media").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, path, filename: file.name, contentType: file.type || "application/octet-stream" });
}
