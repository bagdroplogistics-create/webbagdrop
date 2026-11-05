"use client";
/** Who is signed in to BAGDROP OS, for the screens: the shell hides the
 *  modules a user can't view, and anything can ask `useMe()` before showing
 *  an Edit or Approve button. The server checks every request anyway
 *  (proxy.ts) — this only keeps people from seeing buttons that would fail. */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLoad } from "@/lib/useLoad";
import { can, type Actor, type Perm } from "@/lib/access";
import { Button, Card, Field, Input } from "@/components/ui";

export type Me = Actor & { user: { email: string; mobile: string; dept: string; lastLogin: string | null } | null };
const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);
/** True when the signed-in person has this permission (owner key: always). */
export function useCan(p: Perm): boolean {
  return can(useMe()?.grants, p);
}

export function MeProvider({ children }: { children: (me: Me, reload: () => Promise<void>) => React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [gone, setGone] = useState(false);
  const router = useRouter();
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    if (r.status === 401) { setGone(true); router.replace("/admin/login"); return; }
    if (r.ok) setMe(await r.json());
  }, [router]);
  useLoad(load);
  /* A session lasts 12 hours. When it ends while a tab is still open, every
   * module would just show "UNAUTHORIZED" — so the first 401 from any
   * /api/admin call, and a re-check whenever the tab is focused again,
   * send the person to the sign-in page instead. */
  useEffect(() => {
    const orig = window.fetch;
    const gone = () => { setGone(true); router.replace("/admin/login"); };
    window.fetch = async (input, init) => {
      const r = await orig(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (r.status === 401 && /^(?:https?:\/\/[^/]+)?\/api\/admin\//.test(url) && !url.includes("/api/admin/login")) gone();
      return r;
    };
    const onFocus = () => { orig("/api/admin/me", { cache: "no-store" }).then((r) => { if (r.status === 401) gone(); }).catch(() => undefined); };
    window.addEventListener("focus", onFocus);
    return () => { window.fetch = orig; window.removeEventListener("focus", onFocus); };
  }, [router]);
  if (!me) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">{gone ? "Signing you in again…" : "Loading BAGDROP OS…"}</div>;
  if (me.mustChange) return <SetOwnPassword me={me} onDone={load} />;
  return <MeCtx.Provider value={me}>{children(me, load)}</MeCtx.Provider>;
}

/** Ends this session and goes to the sign-in page. */
export function useSignOut() {
  const router = useRouter();
  return async () => {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  };
}

/** Change your own password; shown on its own after a temporary password. */
export function PasswordForm({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const [cur, setCur] = useState(""), [next, setNext] = useState(""), [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    if (next !== again) { setMsg({ ok: false, text: "The two new passwords don't match." }); return; }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "password", current: cur, next }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.detail ?? j.error ?? "Couldn't change it." }); return; }
    setMsg({ ok: true, text: "Password changed. Your other devices are signed out." }); setCur(""); setNext(""); setAgain("");
    onDone();
  }
  return (
    <div className="grid gap-2">
      <Field label={first ? "Temporary password (from your manager)" : "Current password"}><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="New password"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Field label="New password again"><Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} /></Field>
      <p className="text-xs text-muted">At least 10 characters with letters and numbers, not your name, email or mobile.</p>
      {msg && <p className={`rounded-lg p-2 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      <Button disabled={busy || !cur || !next || !again} onClick={() => void save()}>{busy ? "Saving…" : "Save new password"}</Button>
    </div>
  );
}

function SetOwnPassword({ me, onDone }: { me: Me; onDone: () => Promise<void> }) {
  const signOut = useSignOut();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 font-display text-xl font-extrabold">BAGDROP <span className="text-brand">OS</span></h1>
        <p className="mb-4 text-sm text-muted">Welcome, {me.name}. Set your own password to continue — only you will know it.</p>
        <PasswordForm first onDone={() => void onDone()} />
        <button className="mt-3 w-full cursor-pointer text-center text-xs text-muted underline" onClick={() => void signOut()}>Sign out</button>
      </Card>
    </main>
  );
}
