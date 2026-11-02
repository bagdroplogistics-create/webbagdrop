"use client";
/** Security & audit → Users: team logins for BAGDROP OS. Create a login
 *  with a temporary password (the person sets their own at first sign-in),
 *  pick a department to pre-tick its access, then adjust the checkboxes —
 *  View / Edit per module plus the key actions. Reset a password, turn a
 *  login off or on, sign someone out everywhere, unlock, or delete. */
import { useCallback, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { ACTIONS, DEPARTMENTS, MODULES, type ModKey, type Perm } from "@/lib/access";
import { useMe } from "./session";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

interface U { id: string; name: string; email: string; mobile: string; dept: string; perms: Perm[]; status: "active" | "disabled"; mustChange: boolean; locked: boolean; lastLogin: string | null; created: string; createdBy: string }
type Form = { id?: string; name: string; email: string; mobile: string; dept: string; perms: Perm[]; password: string };
const EMPTY: Form = { name: "", email: "", mobile: "", dept: "operations", perms: DEPARTMENTS.find((d) => d.key === "operations")!.perms, password: "" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const deptName = (k: string) => DEPARTMENTS.find((d) => d.key === k)?.name ?? k;
/** A temporary password that passes the rules: 12 characters, letters and numbers, no look-alikes. */
function tempPassword() {
  const L = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", D = "23456789", A = L + D;
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const s = [...r].map((n, i) => (i === 3 || i === 8 ? D : i === 0 ? L : A)[n % (i === 3 || i === 8 ? D : i === 0 ? L : A).length]).join("");
  return s;
}

export default function Users() {
  const me = useMe();
  const [users, setUsers] = useState<U[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/users", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setUsers(j.users); else setMsg({ ok: false, text: j.detail ?? j.error ?? "Couldn't load users." });
  }, []);
  useLoad(load);

  async function act(body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: j.detail ?? j.error ?? "Failed" });
    if (r.ok) await load();
    return r.ok;
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Users <span className="font-normal text-faint">team logins · email or mobile + password</span></h3>
        {!form && <Button size="sm" onClick={() => setForm({ ...EMPTY, password: tempPassword() })}>New user</Button>}
      </div>
      {msg && <p className={`mb-3 rounded-lg p-2 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}

      {form && <UserForm form={form} setForm={setForm} busy={busy} onCancel={() => setForm(null)}
        onSave={async () => {
          const ok = await act(form.id ? { action: "update", ...form } : { action: "create", ...form },
            form.id ? `Saved ${form.name}.` : `Login created for ${form.name}. Give them their temporary password ${form.password} — they set their own at first sign-in.`);
          if (ok) setForm(null);
        }} />}

      {users && users.length === 0 && !form && <p className="text-sm text-muted">No team logins yet — you&apos;re using the owner&apos;s emergency key. Create a login for each person, starting with yourself (tick Manage users).</p>}
      {users && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-faint"><th className="py-1.5 pr-2">Name</th><th className="pr-2">Department</th><th className="pr-2">Sign-in</th><th className="pr-2">Access</th><th className="pr-2">Status</th><th className="pr-2">Last sign-in</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} u={u} self={u.id === me?.id} busy={busy}
                  onEdit={() => setForm({ id: u.id, name: u.name, email: u.email, mobile: u.mobile, dept: u.dept, perms: u.perms, password: "" })}
                  act={act} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UserRow({ u, self, busy, onEdit, act }: { u: U; self: boolean; busy: boolean; onEdit: () => void; act: (b: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const [panel, setPanel] = useState<"" | "reset" | "delete">("");
  const [pw, setPw] = useState(""), [confirm, setConfirm] = useState("");
  const views = MODULES.filter((m) => u.perms.includes(`${m.key}.view`) || u.perms.includes(`${m.key}.edit`)).length;
  const actions = u.perms.filter((p) => p.startsWith("act.")).length;
  return (
    <>
      <tr className="border-b border-dashed border-line align-top last:border-0">
        <td className="py-2 pr-2"><b>{u.name}</b>{self && <span className="text-faint"> (you)</span>}</td>
        <td className="pr-2">{deptName(u.dept)}</td>
        <td className="pr-2">{u.email}<br /><span className="text-faint">{u.mobile}</span></td>
        <td className="pr-2">{views} module{views === 1 ? "" : "s"} · {actions} action{actions === 1 ? "" : "s"}</td>
        <td className="pr-2">
          {u.status === "disabled" ? <Badge tone="muted">Off</Badge> : u.locked ? <Badge tone="bad">Locked</Badge> : u.mustChange ? <Badge tone="warn">Must set password</Badge> : <Badge tone="ok">Active</Badge>}
        </td>
        <td className="pr-2">{fmt(u.lastLogin)}</td>
        <td>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}>Edit access</Button>
            <Button size="sm" variant="outline" onClick={() => { setPanel(panel === "reset" ? "" : "reset"); setPw(tempPassword()); }}>Reset password</Button>
            {u.locked && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "unlock", id: u.id }, `${u.name} unlocked.`)}>Unlock</Button>}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "signOutAll", id: u.id }, `${u.name} is signed out of every device.`)}>Sign out everywhere</Button>
            {!self && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: u.status === "active" ? "disable" : "enable", id: u.id }, u.status === "active" ? `${u.name}'s login is off — they can't sign in; their history stays.` : `${u.name}'s login is on again.`)}>{u.status === "active" ? "Turn off" : "Turn on"}</Button>}
            {!self && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => { setPanel(panel === "delete" ? "" : "delete"); setConfirm(""); }}>Delete</Button>}
          </div>
        </td>
      </tr>
      {panel === "reset" && (
        <tr><td colSpan={7} className="pb-3">
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3">
            <Field label="New temporary password"><Input className="w-56 font-mono" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Button size="sm" disabled={busy || pw.length < 10} onClick={async () => { if (await act({ action: "resetPassword", id: u.id, password: pw }, `${u.name}'s temporary password is ${pw} — they're signed out everywhere and set their own at next sign-in.`)) setPanel(""); }}>Reset and sign out everywhere</Button>
            <span className="text-xs text-muted">Tell them in person or on a call — not in a group chat.</span>
          </div>
        </td></tr>
      )}
      {panel === "delete" && (
        <tr><td colSpan={7} className="pb-3">
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            <span className="self-center">Deleting removes the login for good; what {u.name} did stays in the audit trail. To pause someone, use Turn off instead.</span>
            <Field label={`Type ${u.name} to confirm`}><Input className="w-48" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <Button size="sm" disabled={busy || confirm.trim().toLowerCase() !== u.name.toLowerCase()} onClick={async () => { if (await act({ action: "delete", id: u.id, confirm }, `${u.name}'s login is deleted.`)) setPanel(""); }}>Delete login</Button>
          </div>
        </td></tr>
      )}
    </>
  );
}

function UserForm({ form, setForm, busy, onSave, onCancel }: { form: Form; setForm: (f: Form) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
  /* Edit includes View, so a module with Edit shows View ticked too */
  const has = (p: Perm) => form.perms.includes(p) || (p.endsWith(".view") && form.perms.includes(p.replace(/\.view$/, ".edit") as Perm));
  const toggle = (p: Perm, on: boolean) => {
    let next = on ? [...form.perms, p] : form.perms.filter((x) => x !== p);
    const [m, lvl] = p.split(".");
    if (lvl === "edit" && on) next.push(`${m}.view` as Perm);           // edit includes view
    if (lvl === "view" && !on) next = next.filter((x) => x !== `${m}.edit`); // no view, no edit
    setForm({ ...form, perms: [...new Set(next)], dept: "custom" });
  };
  const column = (lvl: "view" | "edit", on: boolean) => {
    const keys = MODULES.map((m) => `${m.key}.${lvl}` as Perm);
    let next = on ? [...form.perms, ...keys, ...(lvl === "edit" ? MODULES.map((m) => `${m.key}.view` as Perm) : [])] : form.perms.filter((x) => !keys.includes(x));
    if (lvl === "view" && !on) next = next.filter((x) => !x.endsWith(".edit"));
    setForm({ ...form, perms: [...new Set(next)], dept: "custom" });
  };
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <div className="mb-4 rounded-xl border border-line bg-paper/60 p-3">
      <h4 className="mb-2 text-sm font-bold">{form.id ? `Edit ${form.name}` : "New user"}</h4>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Priya Shah" /></Field>
        <Field label="Email (signs in with this)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@bagdrop.co" /></Field>
        <Field label="Mobile (or this)"><Input inputMode="numeric" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="98xxxxxx10" /></Field>
        <Field label="Department (pre-ticks the boxes)">
          <Select value={form.dept} onChange={(e) => { const d = DEPARTMENTS.find((x) => x.key === e.target.value)!; setForm({ ...form, dept: d.key, perms: d.key === "custom" ? form.perms : d.perms }); }}>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </Select>
        </Field>
        {!form.id && (
          <Field label="Temporary password">
            <div className="flex gap-1.5"><Input className="font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><Button size="sm" variant="outline" onClick={() => setForm({ ...form, password: tempPassword() })}>New</Button></div>
          </Field>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-white p-2.5">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
                <th className="py-1">Module</th>
                <th className="w-20 text-center">View <input type="checkbox" aria-label="View on every module" className="ml-1 align-middle" checked={MODULES.every((m) => has(`${m.key}.view`))} onChange={(e) => column("view", e.target.checked)} /></th>
                <th className="w-20 text-center">Edit <input type="checkbox" aria-label="Edit on every module" className="ml-1 align-middle" checked={MODULES.every((m) => has(`${m.key}.edit`))} onChange={(e) => column("edit", e.target.checked)} /></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g} group={g} mods={MODULES.filter((m) => m.group === g).map((m) => m.key)} has={has} toggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-line bg-white p-2.5 text-xs">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Key actions</div>
          {ACTIONS.map((a) => (
            <label key={a.key} className="flex cursor-pointer items-start gap-2 border-b border-dashed border-line py-1.5 last:border-0">
              <input type="checkbox" className="mt-0.5" checked={has(`act.${a.key}`)} onChange={(e) => toggle(`act.${a.key}`, e.target.checked)} />
              <span><b>{a.name}</b><br /><span className="text-faint">{a.hint}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onSave}>{busy ? "Saving…" : form.id ? "Save access" : "Create login"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function GroupRows({ group, mods, has, toggle }: { group: string; mods: ModKey[]; has: (p: Perm) => boolean; toggle: (p: Perm, on: boolean) => void }) {
  return (
    <>
      <tr><td colSpan={3} className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{group}</td></tr>
      {mods.map((k) => (
        <tr key={k} className="border-b border-dashed border-line last:border-0">
          <td className="py-1">{MODULES.find((m) => m.key === k)!.name}</td>
          <td className="text-center"><input type="checkbox" aria-label={`View ${k}`} checked={has(`${k}.view`)} onChange={(e) => toggle(`${k}.view`, e.target.checked)} /></td>
          <td className="text-center"><input type="checkbox" aria-label={`Edit ${k}`} checked={has(`${k}.edit`)} onChange={(e) => toggle(`${k}.edit`, e.target.checked)} /></td>
        </tr>
      ))}
    </>
  );
}
