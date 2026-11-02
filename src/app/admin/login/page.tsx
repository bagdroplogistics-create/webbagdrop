"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input } from "@/components/ui";

/** BAGDROP OS sign-in: email or mobile + password. The owner's emergency
 *  key sits behind a link; every use of it is logged and alerts the team. */
export default function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<"user" | "owner">("user");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "owner" ? { key } : { login, password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(mode === "owner" ? "Wrong owner key." : j.detail ?? "Couldn't sign in."); return; }
    router.push("/admin");
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") void submit(); };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 font-display text-xl font-extrabold">BAGDROP <span className="text-brand">OS</span></h1>
        {mode === "user" ? (
          <>
            <p className="mb-5 text-sm text-muted">Sign in with your email or mobile and your password.</p>
            <Field label="Email or mobile"><Input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} onKeyDown={enter} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={enter} /></Field>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted">Owner emergency access. Every use is recorded and the team is alerted.</p>
            <Field label="Owner key"><Input type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={enter} /></Field>
          </>
        )}
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <Button className="w-full" disabled={busy || (mode === "owner" ? !key : !login || !password)} onClick={() => void submit()}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted">
          {mode === "user"
            ? <>Forgot your password? Ask a manager to reset it. · <button className="cursor-pointer underline" onClick={() => { setMode("owner"); setErr(""); }}>Owner key</button></>
            : <button className="cursor-pointer underline" onClick={() => { setMode("user"); setErr(""); }}>Back to team sign-in</button>}
        </p>
      </Card>
    </main>
  );
}
