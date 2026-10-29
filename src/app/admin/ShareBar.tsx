"use client";
/** Share a board: WhatsApp text digest, email digest, copy text, or a
 *  branded PNG snapshot (native share sheet on phones, download on desktop).
 *  Used by the admin Dashboard and the read-only head links alike. */
import { useCallback, useState } from "react";
import type { Metrics, ViewKey } from "@/lib/metricsTypes";
import { Button } from "@/components/ui";
import { digest } from "./boards";
import { shareSnapshot } from "./snapshot";

export default function ShareBar({ view, m }: { view: ViewKey; m: Metrics }) {
  const [copied, setCopied] = useState(false);
  const [snap, setSnap] = useState<"idle" | "busy" | "shared" | "downloaded">("idle");

  const share = useCallback((how: "wa" | "mail" | "copy") => {
    const d = digest(view, m);
    if (how === "wa") window.open(`https://wa.me/?text=${encodeURIComponent(d.body)}`, "_blank");
    if (how === "mail") location.href = `mailto:?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(d.body.replace(/\*/g, ""))}`;
    if (how === "copy") navigator.clipboard?.writeText(d.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }, [view, m]);

  const doSnap = useCallback(() => {
    setSnap("busy");
    shareSnapshot(view, m).then((r) => { setSnap(r); setTimeout(() => setSnap("idle"), 2000); }).catch(() => setSnap("idle"));
  }, [view, m]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => share("wa")}>Share on WhatsApp</Button>
      <Button size="sm" variant="outline" onClick={() => share("mail")}>Email digest</Button>
      <Button size="sm" variant="outline" disabled={snap === "busy"} onClick={doSnap}>
        {snap === "busy" ? "Rendering…" : snap === "shared" ? "Shared ✓" : snap === "downloaded" ? "Saved ✓" : "Snapshot PNG"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => share("copy")}>{copied ? "Copied ✓" : "Copy text"}</Button>
    </div>
  );
}
