"use client";
/** Event company portal. Sign-in is a WhatsApp code to a mobile the Bagdrop
 *  team listed on the event (Weddings & events → Event company). After that
 *  the company sees only its own event(s): families, bags and tags, guest
 *  messages, rooms and return bags — the same TeamDesk screen BAGDROP OS uses.
 *  Approving, pricing and cancelling stay with Bagdrop. */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import TeamDesk, { type TeamApi } from "@/components/wedding/TeamDesk";
import type { TeamFamily } from "@/lib/weddingTeamView";

type Ev = { id: string; name: string; venue: string; dates?: { in: string; out: string }; open: boolean; closes: string };
type Data = { company: string; person: string; who: string; events: Ev[]; families: TeamFamily[] };

const api: TeamApi = async (body) => {
  const r = await fetch("/api/event-team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
};

export default function EventPortal() {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/event-team", { cache: "no-store" });
    if (r.status === 401) { setState("out"); return; }
    const j = await r.json().catch(() => null);
    if (r.ok && j) { setData(j); setState("in"); setSel((s) => s || j.events[0]?.id || ""); }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function signOut() { await api({ action: "logout" }); setData(null); setState("out"); }

  const ev = data?.events.find((e) => e.id === sel);
  const fams = (data?.families ?? []).filter((f) => f.eventCode === sel);
  const bags = fams.reduce((a, f) => a + f.bags.length, 0);
  const waiting = fams.filter((f) => f.stage === "waiting").length;
  const noRoom = fams.flatMap((f) => f.members).filter((m) => !m.room).length;
  const unread = fams.filter((f) => f.unread).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
        <span className="font-display text-base font-extrabold">BAG<span className="text-brand">DROP</span> <span className="ml-1 text-xs font-semibold text-muted">Event desk</span></span>
        {state === "in" && data && <span className="flex items-center gap-3 text-xs"><span className="hidden text-muted sm:inline">{data.person ? `${data.person} · ` : ""}{data.company} · {data.who}</span><Button size="sm" variant="outline" onClick={() => void signOut()}>Sign out</Button></span>}
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6">
        {state === "loading" && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
        {state === "out" && <SignIn onIn={() => void load()} />}
        {state === "in" && data && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{data.company}{data.person ? ` · signed in as ${data.person}` : ""}</p>
                <h1 className="font-display text-2xl font-extrabold">{ev?.name ?? "Your event"}</h1>
                {ev && <p className="text-sm text-muted">{ev.venue}{ev.dates ? ` · ${ev.dates.in} to ${ev.dates.out}` : ""} · {ev.open ? `guest bookings close ${ev.closes || "when the event closes"}` : `guest bookings closed${ev.closes ? ` on ${ev.closes}` : ""}`}</p>}
              </div>
              {data.events.length > 1 && (
                <Select className="w-auto" value={sel} onChange={(e) => setSel(e.target.value)}>
                  {data.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["Families", fams.length], ["Bags", bags], ["Awaiting Bagdrop approval", waiting], ["Guests without a room", noRoom], ["New messages", unread]] as const).map(([l, v]) => (
                <Card key={l}><span className="block text-[11px] font-medium text-muted">{l}</span><span className="block font-display text-xl font-extrabold">{v}</span></Card>
              ))}
            </div>
            {sel && <TeamDesk families={data.families} eventId={sel} api={api} tagsBase="/api/event-team/tags" onChanged={() => void load()} />}
          </>
        )}
      </main>
    </div>
  );
}

function SignIn({ onIn }: { onIn: () => void }) {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState<{ to: string; exp: number; token: string; demo?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setBusy(true); setErr("");
    const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel: "mobile", to: mobile }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setOtp({ to: j.to, exp: j.exp, token: j.token, demo: j.demo }); else setErr(j.detail ?? (j.error === "BAD_MOBILE" ? "Enter a 10-digit mobile." : j.error ?? "Couldn't send the code."));
    setBusy(false);
  }
  async function verify() {
    if (!otp) return;
    setBusy(true); setErr("");
    const r = await api({ action: "login", otp: { to: otp.to, code: code.trim(), exp: otp.exp, token: otp.token } });
    if (r.ok) onIn(); else setErr(String(r.j.detail ?? (r.j.error === "OTP_INVALID" ? "That code is wrong or has expired." : r.j.error)));
    setBusy(false);
  }
  return (
    <Card className="mx-auto w-full max-w-md">
      <h1 className="font-display text-xl font-extrabold">Event company sign in</h1>
      <p className="mt-1 text-sm text-muted">Use the mobile number Bagdrop added to your event. We send a 6-digit code on WhatsApp.</p>
      {!otp ? (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Input inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, ""))} />
          <Button disabled={busy || mobile.replace(/\D/g, "").length < 10}>{busy ? "…" : "Send code"}</Button>
        </form>
      ) : (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <Input className="font-mono tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <Button disabled={busy || code.length !== 6}>{busy ? "…" : "Sign in"}</Button>
        </form>
      )}
      {otp && <p className="mt-2 text-xs text-muted">Code sent.{otp.demo ? <> Test code: <b>{otp.demo}</b></> : null} <button type="button" className="font-semibold text-brand underline" onClick={() => { setOtp(null); setCode(""); }}>Change number</button></p>}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </Card>
  );
}
