"use client";
/** The wedding team desk — the same screen for the event company portal
 *  (/event) and BAGDROP OS (Weddings & events). Four tabs:
 *   Messages · guest questions and replies (the guest gets each reply on WhatsApp)
 *   Rooms    · a room per guest, a room per bag, and a rooming-list upload
 *   Returns  · scan a bag tag (camera or scanner gun), note its condition, accept
 *   Tags     · print every tag, only new ones, or only the ones whose room changed
 *  Writes go through `api` (the portal's or the OS's route); `onChanged` reloads. */
import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import CameraScanner from "@/components/CameraScanner";
import type { TeamFamily, TeamBag } from "@/lib/weddingTeamView";

export type TeamApi = (body: Record<string, unknown>) => Promise<{ ok: boolean; j: Record<string, unknown> }>;
type Tab = "msg" | "rooms" | "returns" | "tags";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const errText = (j: Record<string, unknown>) => String(j.detail || j.error || "Something went wrong");

export default function TeamDesk({ families, eventId, api, tagsBase, onChanged }: {
  families: TeamFamily[]; eventId: string; api: TeamApi; tagsBase: string; onChanged: () => void;
}) {
  const fams = useMemo(() => families.filter((f) => f.eventCode === eventId), [families, eventId]);
  const unread = fams.filter((f) => f.unread).length;
  const bags = fams.flatMap((f) => f.bags.map((b) => ({ f, b })));
  const noRoom = fams.flatMap((f) => f.members).filter((m) => !m.room).length;
  const reprint = bags.filter(({ b }) => b.reprint).length, fresh = bags.filter(({ b }) => !b.printed).length;
  const retBooked = bags.filter(({ b }) => b.returning).length, retDone = bags.filter(({ b }) => b.returned).length;
  const [tab, setTab] = useState<Tab>(unread ? "msg" : "rooms");

  const TABS: [Tab, string][] = [
    ["msg", `Messages${unread ? ` · ${unread} new` : ""}`],
    ["rooms", `Rooms${noRoom ? ` · ${noRoom} missing` : ""}`],
    ["returns", `Returns · ${retDone}/${retBooked}`],
    ["tags", `Tags${reprint ? ` · ${reprint} to reprint` : ""}`],
  ];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === k ? "bg-ink text-white" : "bg-paper text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      {tab === "msg" && <MessagesTab fams={fams} api={api} onChanged={onChanged} />}
      {tab === "rooms" && <RoomsTab fams={fams} eventId={eventId} api={api} onChanged={onChanged} />}
      {tab === "returns" && <ReturnsTab bags={bags} api={api} onChanged={onChanged} booked={retBooked} done={retDone} />}
      {tab === "tags" && <TagsTab fams={fams} eventId={eventId} tagsBase={tagsBase} total={bags.length} fresh={fresh} reprint={reprint} />}
    </div>
  );
}

/* ---------------- Messages ---------------- */
function MessagesTab({ fams, api, onChanged }: { fams: TeamFamily[]; api: TeamApi; onChanged: () => void }) {
  const threads = [...fams].filter((f) => f.messages.length)
    .sort((a, b) => Number(b.unread) - Number(a.unread) || b.messages.at(-1)!.at.localeCompare(a.messages.at(-1)!.at));
  const [open, setOpen] = useState<string | null>(threads[0]?.id ?? null);
  const cur = threads.find((f) => f.id === open) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Conversations</h3>
        {threads.length === 0 && <p className="text-sm text-muted">No guest messages yet. Guests write from their My bags page.</p>}
        <div className="grid gap-1">
          {threads.map((f) => (
            <button key={f.id} type="button" onClick={() => setOpen(f.id)}
              className={`cursor-pointer rounded-lg p-2 text-left text-xs ${open === f.id ? "bg-paper" : "hover:bg-paper"}`}>
              <span className="flex items-center justify-between gap-2"><b className="truncate">{f.family}</b>{f.unread && <Badge tone="warn">new</Badge>}</span>
              <span className="block truncate text-muted">{f.messages.at(-1)!.text}</span>
            </button>
          ))}
        </div>
      </Card>
      {cur ? <Thread fam={cur} api={api} onChanged={onChanged} /> : <Card><p className="py-8 text-center text-sm text-muted">Pick a conversation.</p></Card>}
    </div>
  );
}

function Thread({ fam, api, onChanged }: { fam: TeamFamily; api: TeamApi; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setBusy(true); setErr("");
    const r = await api({ action: "reply", id: fam.id, text });
    if (r.ok) { setText(""); onChanged(); } else setErr(errText(r.j));
    setBusy(false);
  }
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold">{fam.family} <span className="font-normal text-faint">{fam.id}</span></h3>
        <span className="text-xs text-muted">{fam.lead} · {fam.mobile}</span>
      </div>
      <div className="grid max-h-96 gap-2 overflow-y-auto">
        {fam.messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-xl border p-2.5 text-sm ${m.by === "guest" ? "border-line bg-paper" : "ml-auto border-green-200 bg-green-50"}`}>
            <p className="mb-1 text-[11px] text-muted">{m.by === "guest" ? `${m.name} (guest)` : m.name}{m.tag ? ` · bag ${m.tag}` : ""} · {when(m.at)}</p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>
      <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea className="w-full rounded-xl border border-line bg-white p-2.5 text-sm" rows={3} maxLength={1000} placeholder="Reply to the guest. They also get it on WhatsApp." value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-2"><Button size="sm" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send reply"}</Button>{err && <span className="text-xs text-red-700">{err}</span>}</div>
      </form>
    </Card>
  );
}

/* ---------------- Rooms ---------------- */
function RoomsTab({ fams, eventId, api, onChanged }: { fams: TeamFamily[]; eventId: string; api: TeamApi; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? fams.filter((f) => [f.family, f.id, f.lead, f.mobile, ...f.members.map((m) => m.name), ...f.bags.map((b) => b.tag)].some((s) => s.toLowerCase().includes(needle))) : fams;
  async function save(body: Record<string, unknown>) {
    setErr("");
    const r = await api(body);
    if (r.ok) onChanged(); else setErr(errText(r.j));
  }
  return (
    <div className="grid gap-4">
      <RoomingUpload eventId={eventId} api={api} onChanged={onChanged} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">Rooms by guest</h3>
          <Input className="max-w-xs !py-1.5 text-xs" placeholder="Search family, guest, mobile or tag" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
        <p className="mb-3 text-xs text-muted">Type a room and press Enter or leave the box. Every bag of that guest follows the room, unless a bag has its own room below.</p>
        <div className="grid gap-3">
          {shown.map((f) => (
            <div key={f.id} className="rounded-xl border border-line p-3">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs"><b className="text-[13px]">{f.family}</b><span className="font-mono text-faint">{f.id}</span>{f.side && <span className="text-muted">{f.side}</span>}<Badge tone={f.tone as "ok"}>{f.statusLabel}</Badge></p>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-faint"><th className="py-1 pr-2">Guest</th><th className="pr-2">Leaves</th><th className="pr-2">Room</th><th>Bags</th></tr></thead>
                <tbody>
                  {f.members.map((m) => (
                    <tr key={m.id} className="border-t border-dashed border-line align-top">
                      <td className="py-1.5 pr-2 font-semibold">{m.name}</td>
                      <td className="pr-2">{m.leaves || "—"}</td>
                      <td className="pr-2"><RoomBox value={m.room} onSave={(room) => save({ action: "setRoom", id: f.id, memberId: m.id, room })} /></td>
                      <td className="py-1">
                        {f.bags.filter((b) => b.owner === m.id).map((b) => (
                          <div key={b.tag} className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px]">{b.tag}</span><span className="text-muted">{b.bag}</span>
                            <span className="text-muted">to {b.deliver}</span>
                            {b.reprint && <Badge tone="warn">reprint tag</Badge>}
                            <RoomBox small placeholder="own room" value={b.room} onSave={(room) => save({ action: "setBagRoom", id: f.id, bagId: b.bagId, room })} />
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {shown.length === 0 && <p className="text-sm text-muted">No families match.</p>}
        </div>
      </Card>
    </div>
  );
}

function RoomBox({ value, onSave, small, placeholder = "Room" }: { value: string; onSave: (room: string) => Promise<void> | void; small?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setV(value); } // a reload brought a newer room
  async function commit() {
    if (v.trim() === value) return;
    setBusy(true); await onSave(v.trim()); setBusy(false);
  }
  return <Input className={`${small ? "!w-24" : "!w-28"} !py-1 !text-xs`} placeholder={placeholder} value={v} disabled={busy} maxLength={20}
    onChange={(e) => setV(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function RoomingUpload({ eventId, api, onChanged }: { eventId: string; api: TeamApi; onChanged: () => void }) {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ apply: { id: string; guest: string; family: string; room: string; was: string; by: string }[]; unmatched: { row: { name: string; mobile?: string; room: string }; reason: string }[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(apply: boolean, text = csv) {
    setBusy(true); setMsg("");
    const r = await api({ action: "rooming", event: eventId, csv: text, apply });
    if (!r.ok) setMsg(errText(r.j));
    else if (apply) { setMsg(`${r.j.applied} room(s) updated.${(r.j.unmatched as unknown[]).length ? ` ${(r.j.unmatched as unknown[]).length} row(s) not matched.` : ""}`); setPreview(null); setCsv(""); onChanged(); }
    else setPreview(r.j as never);
    setBusy(false);
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold">Upload the rooming list</h3>
          <p className="text-xs text-muted">A CSV with columns Name, Mobile and Room (save an Excel sheet as CSV). Guests are matched by mobile first, then by exact name. You see every match before anything changes.</p>
        </div>
        <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold hover:bg-paper">
          Choose CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const t = await f.text(); setCsv(t); setName(f.name); await run(false, t); }} />
        </label>
      </div>
      {msg && <p className="mt-2 text-xs font-semibold">{msg}</p>}
      {preview && (
        <div className="mt-3 grid gap-2 text-xs">
          <p><b>{name}</b> · {preview.apply.length} guest(s) matched · {preview.unmatched.length} row(s) not matched</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
            <table className="w-full">
              <tbody>
                {preview.apply.map((m, i) => (
                  <tr key={i} className="border-b border-dashed border-line last:border-0">
                    <td className="p-1.5">{m.guest} <span className="text-muted">· {m.family}</span></td>
                    <td className="p-1.5">{m.was && m.was !== m.room ? <><s className="text-muted">{m.was}</s> → </> : null}<b>{m.room}</b></td>
                    <td className="p-1.5 text-muted">by {m.by}</td>
                  </tr>
                ))}
                {preview.unmatched.map((u, i) => (
                  <tr key={`u${i}`} className="border-b border-dashed border-line bg-amber-50 last:border-0">
                    <td className="p-1.5">{u.row.name || u.row.mobile || "(blank)"}</td><td className="p-1.5">{u.row.room}</td><td className="p-1.5 text-amber-800">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !preview.apply.length} onClick={() => void run(true)}>Apply {preview.apply.length} room(s)</Button>
            <Button size="sm" variant="ghost" onClick={() => { setPreview(null); setCsv(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Returns ---------------- */
function ReturnsTab({ bags, api, onChanged, booked, done }: { bags: { f: TeamFamily; b: TeamBag }[]; api: TeamApi; onChanged: () => void; booked: number; done: number }) {
  const [code, setCode] = useState("");
  const [cam, setCam] = useState(false);
  const [condition, setCondition] = useState<"ok" | "damaged">("ok");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const tag = code.trim().toUpperCase();
  const hit = bags.find(({ b }) => b.tag.toUpperCase() === tag) ?? null;

  async function accept() {
    setBusy(true); setMsg(null);
    const r = await api({ action: "acceptReturn", tag, condition, note });
    if (r.ok) { setMsg({ ok: true, text: `Accepted ${tag}${condition === "damaged" ? " · marked damaged" : ""}.` }); setCode(""); setNote(""); setCondition("ok"); onChanged(); }
    else setMsg({ ok: false, text: errText(r.j) });
    setBusy(false);
  }
  const needle = q.trim().toLowerCase();
  const list = bags.filter(({ b }) => b.returning).filter(({ f, b }) => !needle || [f.family, f.lead, f.mobile, b.guest, b.tag].some((s) => s.toLowerCase().includes(needle)));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <h3 className="mb-1 font-display text-sm font-bold">Accept a return bag</h3>
        <p className="mb-3 text-xs text-muted">Scan the bag&apos;s tag (camera or scanner gun), check it, then accept. Only bags booked for the trip home can be accepted: {done} of {booked} done.</p>
        <div className="flex flex-wrap gap-2">
          <Input className="flex-1 font-mono" placeholder="Scan or type the tag code" value={code} autoFocus onChange={(e) => { setCode(e.target.value); setMsg(null); }} />
          <Button size="sm" variant="outline" type="button" onClick={() => setCam((v) => !v)}>{cam ? "Stop camera" : "Camera"}</Button>
        </div>
        {cam && <div className="mt-2"><CameraScanner onRead={(c) => { setCode(c); setCam(false); setMsg(null); }} /></div>}
        {tag && !hit && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-900">No bag on this event has this tag.</p>}
        {hit && (
          <div className="mt-3 rounded-xl border border-line p-3 text-sm">
            <p className="font-semibold">{hit.b.guest} · {hit.b.bag} <span className="text-muted">· bag {hit.b.n} of {hit.b.of}</span></p>
            <p className="text-xs text-muted">{hit.f.family} · {hit.b.deliver} · {hit.b.ret}</p>
            {!hit.b.returning && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-900">Booked one way. Bookings are closed, so it cannot be added for the trip home.</p>}
            {hit.b.returned && <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">Already accepted {when(hit.b.returned.at)} by {hit.b.returned.by} · {hit.b.returned.condition === "ok" ? "condition OK" : `DAMAGED · ${hit.b.returned.note ?? ""}`}</p>}
            {hit.b.returning && !hit.b.returned && (
              <div className="mt-3 grid gap-2">
                <div className="flex gap-2 text-xs">
                  {(["ok", "damaged"] as const).map((c) => (
                    <label key={c} className={`cursor-pointer rounded-lg border px-3 py-1.5 font-semibold ${condition === c ? (c === "ok" ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50") : "border-line"}`}>
                      <input type="radio" className="sr-only" checked={condition === c} onChange={() => setCondition(c)} />{c === "ok" ? "Condition OK" : "Damaged"}
                    </label>
                  ))}
                </div>
                <Input placeholder={condition === "damaged" ? "Describe the damage (required)" : "Note (optional)"} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" disabled={busy || (condition === "damaged" && !note.trim())} onClick={() => void accept()}>{busy ? "Saving…" : "Accept return bag"}</Button>
              </div>
            )}
          </div>
        )}
        {msg && <p className={`mt-3 rounded-lg p-2.5 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      </Card>
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">Booked for the trip home</h3>
          <Input className="max-w-[200px] !py-1.5 text-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid max-h-[28rem] gap-1 overflow-y-auto text-xs">
          {list.map(({ f, b }) => (
            <button key={b.tag} type="button" onClick={() => { setCode(b.tag); setMsg(null); }} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-paper">
              <span><b>{b.guest}</b> · {b.bag}<span className="block font-mono text-[11px] text-faint">{b.tag} · {f.family}</span></span>
              {b.returned ? <Badge tone={b.returned.condition === "ok" ? "ok" : "bad"}>{b.returned.condition === "ok" ? "accepted" : "damaged"}</Badge> : <Badge tone="muted">waiting</Badge>}
            </button>
          ))}
          {list.length === 0 && <p className="text-muted">No return bags booked{needle ? " match" : ""}.</p>}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Tags ---------------- */
function TagsTab({ fams, eventId, tagsBase, total, fresh, reprint }: { fams: TeamFamily[]; eventId: string; tagsBase: string; total: number; fresh: number; reprint: number }) {
  const [media, setMedia] = useState("4x6");
  const link = (extra: string) => `${tagsBase}?event=${encodeURIComponent(eventId)}&media=${media}&mark=1${extra}`;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-display text-sm font-bold">Print bag tags · one per bag</h3>
        <Select className="w-auto !py-1.5 !text-xs" value={media} onChange={(e) => setMedia(e.target.value)}>
          <option value="4x6">4×6 thermal</option><option value="ql62x100">Brother QL-800 · 62×100</option><option value="a4">A4 · 4 per sheet</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <a className="rounded-lg border border-line bg-white px-3 py-2 font-semibold hover:bg-paper" href={link("")} target="_blank" rel="noreferrer">All tags ({total})</a>
        <a className={`rounded-lg border px-3 py-2 font-semibold ${fresh ? "border-line bg-white hover:bg-paper" : "pointer-events-none border-line text-faint"}`} href={link("&only=new")} target="_blank" rel="noreferrer">Not printed yet ({fresh})</a>
        <a className={`rounded-lg border px-3 py-2 font-semibold ${reprint ? "border-amber-400 bg-amber-50 hover:bg-amber-100" : "pointer-events-none border-line text-faint"}`} href={link("&only=reprint")} target="_blank" rel="noreferrer">Room changed, reprint ({reprint})</a>
      </div>
      <p className="mt-2 text-xs text-muted">Opening a sheet records what each tag says, so a later room change shows here as a reprint.</p>
      <div className="mt-4 grid gap-1 text-xs">
        {fams.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line py-1.5">
            <span><b>{f.family}</b> <span className="font-mono text-faint">{f.id}</span> · {f.bags.length} bag(s){f.bags.some((b) => b.reprint) ? " · " : ""}{f.bags.some((b) => b.reprint) && <Badge tone="warn">reprint</Badge>}</span>
            <a className="font-semibold text-brand hover:underline" href={`${link("")}&id=${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer">Print this family</a>
          </div>
        ))}
      </div>
    </Card>
  );
}
