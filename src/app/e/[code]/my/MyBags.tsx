"use client";
/** Wedding guest dashboard, in the Y2K desk's look (same tokens and fonts).
 *  Sign-in is an OTP to the mobile the family booked with — the same client
 *  session as /account — then /api/wedding/my lists that mobile's family
 *  bookings for the event: approval status, every bag's tag code with a
 *  scannable QR and its stage. "Book now" opens a fresh booking on the desk.
 *  Guests cannot edit a saved booking; the team changes it in BAGDROP OS. */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { withBase } from "@/lib/basePath";

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap";
const EVENTS: Record<string, { id: string; names: string; place: string; desk: string }> = {
  Y2K: { id: "Y2K-WED", names: "Yashna & Yash", place: "Taj Aravali · Udaipur · 17 & 18 December 2026", desk: withBase("/e/y2k") },
};
EVENTS["Y2K-WED"] = EVENTS["#Y2K"] = EVENTS.Y2K;

type Bag = { tag: string; qr: string; owner: string; type: string; colour: string; stage: string; stages: string[]; returning: boolean; deliver: string };
type Msg = { at: string; by: "guest" | "event" | "bagdrop"; name: string; text: string; tag: string };
type Fam = {
  id: string; status: string; statusLabel: string; tone: string; stage: string; created: string;
  familyName: string; side: string; route: string;
  pickups: { label: string; city: string; date: string; slot: string }[];
  members: { name: string; room: string }[];
  bags: Bag[];
  messages: Msg[];
};

const NOTE: Record<string, string> = {
  waiting: "Request received. Bagdrop is reviewing it and will WhatsApp you the moment it is confirmed.",
  confirmed: "Confirmed by Bagdrop. The hosts are covering this, so there is nothing to pay.",
  moving: "Your bags are on their way. Each bag's stage below updates as our team scans it.",
  done: "Delivered. Thank you for travelling light with Bagdrop.",
  closed: "This booking is closed. Message Bagdrop on WhatsApp if this is a mistake.",
};

export default function MyBags() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { code = "" } = useParams<{ code: string }>();
  const ev = EVENTS[decodeURIComponent(code).trim().toUpperCase()];
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [who, setWho] = useState("");
  const [fams, setFams] = useState<Fam[]>([]);
  const [open, setOpen] = useState(true);
  const [closes, setCloses] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!ev) return;
    const r = await fetch(`/api/wedding/my?event=${encodeURIComponent(ev.id)}`, { cache: "no-store" });
    if (r.status === 401) { setState("out"); return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? `HTTP ${r.status}`); return; }
    setWho(j.who); setFams(j.bookings); setOpen(j.booking?.open !== false); setCloses(j.booking?.closes ?? ""); setState("in"); setErr("");
  }, [ev]);

  useEffect(() => {
    // first load, then a quiet refresh so stages move without a reload
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  if (!ev) {
    return <Shell><div className="mb-card mb-center"><h2 className="mb-h2">This page is not open yet.</h2><p className="mb-muted">Check the link on your invitation, or ask the hosts for a fresh one.</p></div></Shell>;
  }

  async function signOut() {
    await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setFams([]); setState("out");
  }

  const bags = fams.reduce((a, f) => a + f.bags.length, 0);
  const waiting = fams.filter((f) => f.stage === "waiting").length;

  return (
    <Shell ev={ev} canBook={open} signedIn={state === "in"} onSignOut={() => void signOut()}>
      <header className="mb-hero">
        <p className="mb-eyebrow">{ev.names} · {ev.place}</p>
        <h1 className="mb-h1">My bags</h1>
        {state === "in" && <p className="mb-sub">Signed in as {who}</p>}
        {state === "in" && closes && <p className="mb-sub mb-muted">{open ? `Bookings close ${closes}.` : `Bookings closed on ${closes}. No new bookings, extra bags or return trips can be added.`}</p>}
      </header>

      {err && <p className="mb-card mb-err">Couldn&apos;t load your bookings: {err}</p>}
      {state === "loading" && <p className="mb-muted mb-center">Loading…</p>}
      {state === "out" && <SignIn onIn={() => void load()} />}

      {state === "in" && (
        <>
          <div className="mb-kpis">
            <div><b>{fams.length}</b><span>{fams.length === 1 ? "Family booking" : "Family bookings"}</span></div>
            <div><b>{bags}</b><span>Bags</span></div>
            <div><b>{waiting}</b><span>Awaiting approval</span></div>
          </div>

          {fams.length === 0 && (
            <div className="mb-card mb-center">
              <h2 className="mb-h2">No bookings on this mobile yet</h2>
              {open ? <>
                <p className="mb-muted">Book your family&apos;s luggage pickup in two minutes.</p>
                <a className="mb-btn" href={`${ev.desk}?new=1#book`}>Book now</a>
              </> : <p className="mb-muted">Bookings are closed. Message Bagdrop on WhatsApp if you need help.</p>}
            </div>
          )}

          {fams.map((f) => (
            <section key={f.id} className="mb-card">
              <div className="mb-famhead">
                <div>
                  <p className="mb-label">Booking code</p>
                  <p className="mb-code">{f.id}</p>
                  <p className="mb-fam">{f.familyName}{f.side ? <span className="mb-muted"> · {f.side === "groom" ? "Groom's side" : "Bride's side"}</span> : null}</p>
                </div>
                <span className={`mb-pill mb-${f.tone}`}>{f.statusLabel}</span>
              </div>
              <p className={`mb-note mb-note-${f.stage}`}>{NOTE[f.stage] ?? ""}</p>

              <div className="mb-grid2">
                <div>
                  <p className="mb-label">Pickups</p>
                  {f.pickups.length === 0 && <p className="mb-muted">To be confirmed</p>}
                  {f.pickups.map((p, i) => <p key={i} className="mb-line">{p.label ? `${p.label} · ` : ""}{p.city} · {p.date}{p.slot ? `, ${p.slot}` : ""}</p>)}
                </div>
                <div>
                  <p className="mb-label">Guests and rooms</p>
                  {f.members.map((m, i) => <p key={i} className="mb-line">{m.name || "Guest"} · {m.room ? `Room ${m.room}` : <span className="mb-muted">room to be assigned</span>}</p>)}
                </div>
              </div>

              <p className="mb-label mb-gap">Bag tags · {f.bags.length}</p>
              <div className="mb-bags">
                {f.bags.map((b) => {
                  const k = Math.max(0, b.stages.indexOf(b.stage));
                  return (
                    <article key={b.tag} className="mb-bag">
                      <div className="mb-bagtop">
                        <div>
                          <p className="mb-owner">{b.owner}</p>
                          <p className="mb-muted">{b.colour} {b.type}{b.returning ? " · coming back" : ""}</p>
                          {b.deliver && <p className="mb-goes">Goes to {b.deliver}</p>}
                          <p className="mb-tag">{b.tag}</p>
                        </div>
                        <div className="mb-qr" aria-label={`QR code for ${b.tag}`} dangerouslySetInnerHTML={{ __html: b.qr }} />
                      </div>
                      <div className="mb-track" style={{ gridTemplateColumns: `repeat(${b.stages.length},1fr)` }}>
                        {b.stages.map((s, i) => <span key={s} className={i <= k ? "on" : ""} title={s} />)}
                      </div>
                      <p className="mb-stage">Now: <b>{b.stage}</b>{k < b.stages.length - 1 ? <span className="mb-muted"> · next {b.stages[k + 1]}</span> : null}</p>
                    </article>
                  );
                })}
              </div>

              <Messages fam={f} event={ev.id} onSent={() => void load()} />
            </section>
          ))}

          {fams.length > 0 && open && (
            <div className="mb-card mb-center">
              <h2 className="mb-h2">Booking for another family?</h2>
              <p className="mb-muted">Start a new booking on the desk. It appears here as soon as it is saved with this mobile.</p>
              <a className="mb-btn" href={`${ev.desk}?new=1#book`}>Book now</a>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Messages({ fam, event, onSent }: { fam: Fam; event: string; onSent: () => void }) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setBusy(true); setErr("");
    const r = await fetch("/api/wedding/my", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", event, id: fam.id, text, tag: tag || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setText(""); setTag(""); onSent(); } else setErr(j.detail || "Couldn't send. Please try again.");
    setBusy(false);
  }
  return (
    <div className="mb-msgs">
      <p className="mb-label mb-gap">Questions about your bags</p>
      {fam.messages.length === 0 && <p className="mb-muted mb-small">Ask anything about your bags, rooms or pickups. The event team and Bagdrop reply here and on WhatsApp.</p>}
      {fam.messages.map((m, i) => (
        <div key={i} className={`mb-msg ${m.by === "guest" ? "mb-me" : ""}`}>
          <p className="mb-msgh">{m.name}{m.tag ? ` · bag ${m.tag}` : ""} · {new Date(m.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          <p>{m.text}</p>
        </div>
      ))}
      <form className="mb-msgform" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <select className="mb-input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="About which bag">
          <option value="">About the whole booking</option>
          {fam.bags.map((b) => <option key={b.tag} value={b.tag}>{b.owner} · {b.colour} {b.type}</option>)}
        </select>
        <textarea className="mb-input" rows={3} maxLength={1000} placeholder="Type your question" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="mb-btn" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
      </form>
      {err && <p className="mb-errtext">{err}</p>}
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
    if (r.ok) setOtp({ to: j.to, exp: j.exp, token: j.token, demo: j.demo });
    else setErr(j.detail ?? (j.error === "BAD_MOBILE" ? "Enter the 10-digit mobile you booked with." : j.error ?? "Couldn't send the code."));
    setBusy(false);
  }
  async function verify() {
    if (!otp) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", otp: { to: otp.to, code: code.trim(), exp: otp.exp, token: otp.token } }) });
    if (r.ok) onIn();
    else setErr(r.status === 401 ? "That code is wrong or has expired." : "Couldn't sign you in. Try a new code.");
    setBusy(false);
  }

  return (
    <div className="mb-card mb-signin">
      <h2 className="mb-h2">Sign in to see your bags</h2>
      <p className="mb-muted">Use the mobile number your family booked with. We send a 6-digit code on WhatsApp.</p>
      {!otp ? (
        <form className="mb-row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className="mb-input" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, ""))} />
          <button className="mb-btn" disabled={busy || mobile.replace(/\D/g, "").length < 10}>{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form className="mb-row" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <input className="mb-input mb-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <button className="mb-btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
        </form>
      )}
      {otp && <p className="mb-muted mb-small">Code sent.{otp.demo ? <> Test code: <b>{otp.demo}</b></> : null} <button type="button" className="mb-link" onClick={() => { setOtp(null); setCode(""); }}>Change number</button></p>}
      {err && <p className="mb-errtext">{err}</p>}
    </div>
  );
}

function Shell({ children, ev, canBook = true, signedIn, onSignOut }: { children: ReactNode; ev?: { desk: string }; canBook?: boolean; signedIn?: boolean; onSignOut?: () => void }) {
  return (
    <div className="mb">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav className="mb-nav">
        <a className="mb-brand" href={ev?.desk ?? withBase("/")}>BAGDROP <span>#Y2K</span></a>
        <div className="mb-navr">
          {ev && canBook && <a className="mb-btn mb-sm" href={`${ev.desk}?new=1#book`}>Book now</a>}
          {signedIn && <button type="button" className="mb-link" onClick={onSignOut}>Sign out</button>}
        </div>
      </nav>
      <main className="mb-main">{children}</main>
    </div>
  );
}

const CSS = `
.mb{--cream:#F4EEE4;--paper:#FBF8F2;--card:#FFFFFF;--ink:#2B2620;--body:#5A5145;--label:#6B5A3E;--stone:#8A8172;--line:#E0D5C2;--line-2:#EDE5D6;
  --forest:#2A3329;--forest-2:#24291F;--on-dark:#F4EEE4;--gold:#C8A96E;--sand:#E8CE9A;--ok:#4E6B3F;--warn:#A8742A;--err:#A4452C;
  --display:"Cormorant Garamond",Georgia,serif;--sans:"Inter",system-ui,sans-serif;--mono:ui-monospace,Menlo,monospace;
  min-height:100vh;background:var(--cream);color:var(--ink);font:400 15px/1.55 var(--sans)}
.mb *{box-sizing:border-box}
.mb-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,4vw,40px);background:var(--forest-2);color:var(--on-dark)}
.mb-brand{color:var(--on-dark);text-decoration:none;font:700 13px/1 var(--sans);letter-spacing:.2em}.mb-brand span{color:var(--sand);margin-left:6px}
.mb-navr{display:flex;align-items:center;gap:14px}
.mb-main{max-width:980px;margin:0 auto;padding:0 clamp(16px,4vw,40px) 80px}
.mb-hero{padding:44px 0 22px;text-align:center}
.mb-eyebrow{margin:0;color:var(--label);font:600 11px/1.4 var(--sans);letter-spacing:.2em;text-transform:uppercase}
.mb-h1{margin:10px 0 0;font:500 clamp(40px,8vw,64px)/1 var(--display)}
.mb-h2{margin:0 0 6px;font:500 28px/1.15 var(--display)}
.mb-sub{margin:10px 0 0;color:var(--body)}
.mb-muted{color:var(--stone)}.mb-small{font-size:13px;margin:12px 0 0}
.mb-center{text-align:center}
.mb-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:clamp(18px,3vw,28px);margin-top:18px}
.mb-err{color:var(--err)}.mb-errtext{color:var(--err);margin:10px 0 0;font-size:14px}
.mb-signin{max-width:520px;margin:18px auto 0}
.mb-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.mb-input{flex:1;min-width:180px;border:1px solid var(--line);border-radius:12px;padding:14px 16px;font:500 16px/1 var(--sans);background:var(--paper);color:var(--ink)}
.mb-otp{font-family:var(--mono);letter-spacing:.3em}
.mb-btn{display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer;border-radius:999px;padding:15px 24px;background:var(--forest);color:var(--on-dark);font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;text-decoration:none}
.mb-btn:disabled{opacity:.45;cursor:default}
.mb-nav .mb-btn{background:var(--sand);color:var(--forest-2)}
.mb-sm{padding:11px 18px}
.mb-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.mb-link{background:none;border:0;padding:0;cursor:pointer;color:inherit;font:600 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px}
.mb-card .mb-btn{margin-top:14px}
.mb-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.mb-kpis div{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.mb-kpis b{display:block;font:500 32px/1 var(--display)}.mb-kpis span{color:var(--label);font-size:12px;letter-spacing:.06em}
.mb-famhead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}
.mb-label{margin:0 0 6px;color:var(--label);font:600 11px/1.3 var(--sans);letter-spacing:.18em;text-transform:uppercase}
.mb-code{margin:0;font:600 22px/1.1 var(--mono);letter-spacing:.04em}
.mb-fam{margin:6px 0 0;font:500 22px/1.2 var(--display)}
.mb-pill{border-radius:999px;padding:8px 14px;font:600 12px/1 var(--sans);letter-spacing:.08em;white-space:nowrap}
.mb-ok{background:#E7EEDF;color:var(--ok)}.mb-warn{background:#F6EAD4;color:var(--warn)}.mb-info{background:#E6ECF2;color:#3D5A73}.mb-bad{background:#F5E0DA;color:var(--err)}.mb-muted.mb-pill{background:var(--line-2)}
.mb-note{margin:14px 0 0;padding:12px 14px;border-radius:12px;background:var(--paper);border:1px solid var(--line-2);color:var(--body);font-size:14px}
.mb-note-confirmed,.mb-note-done{background:#EEF2E8;border-color:#D6E0CB;color:#3E5531}
.mb-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:20px}
.mb-line{margin:0 0 4px}
.mb-gap{margin-top:22px}
.mb-bags{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.mb-bag{border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:14px;padding:14px;background:var(--paper)}
.mb-bagtop{display:flex;justify-content:space-between;gap:12px}
.mb-owner{margin:0;font:500 20px/1.15 var(--display)}
.mb-bag .mb-muted{margin:2px 0 0;font-size:13px}
.mb-tag{margin:8px 0 0;font:600 13px/1.2 var(--mono);word-break:break-all}
.mb-qr{flex:0 0 76px;width:76px;height:76px;background:#fff;padding:4px;border-radius:6px}.mb-qr svg{width:100%;height:100%;display:block}
.mb-track{display:grid;gap:3px;margin-top:14px}.mb-track span{height:5px;border-radius:3px;background:var(--line)}.mb-track span.on{background:var(--forest)}
.mb-stage{margin:8px 0 0;font-size:13px}
.mb-goes{margin:4px 0 0;font-size:13px;font-weight:600;color:var(--label)}
.mb-msgs{border-top:1px solid var(--line-2);margin-top:22px}
.mb-msg{background:var(--paper);border:1px solid var(--line-2);border-radius:12px;padding:10px 12px;margin:8px 0;max-width:88%}
.mb-msg p{margin:0}.mb-msg.mb-me{margin-left:auto;background:#EEF2E8;border-color:#D6E0CB}
.mb-msgh{font-size:12px;color:var(--stone);margin-bottom:4px!important}
.mb-msgform{display:grid;gap:8px;margin-top:10px}.mb-msgform textarea{font:400 15px/1.4 var(--sans);resize:vertical}.mb-msgform .mb-btn{justify-self:start;margin-top:0}
@media (max-width:560px){.mb-kpis{grid-template-columns:1fr 1fr 1fr}.mb-kpis b{font-size:26px}.mb-code{font-size:18px}}
`;
