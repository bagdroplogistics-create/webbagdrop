"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input } from "@/components/ui";

export default function AdminLogin() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }),
    });
    setBusy(false);
    if (!r.ok) { setErr("Wrong admin key."); return; }
    router.push("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 font-display text-xl font-extrabold">BAGDROP <span className="text-brand">OS</span></h1>
        <p className="mb-5 text-sm text-muted">Enter the admin key to open the console.</p>
        <Field label="Admin key">
          <Input
            type="password" value={key} autoFocus
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          />
        </Field>
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <Button className="w-full" disabled={busy || !key} onClick={() => void submit()}>
          {busy ? "Checking…" : "Enter"}
        </Button>
      </Card>
    </main>
  );
}
