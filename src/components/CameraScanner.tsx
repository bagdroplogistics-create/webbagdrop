"use client";
/** Phone-camera barcode scanner (the browser's BarcodeDetector — no
 *  libraries). Reads Code 128, Code 39, QR and PDF417. Each distinct code
 *  is reported once per 2 s, so holding the camera on a tag doesn't spam.
 *  Handheld scanner guns don't need this — they type into the input. */
import { useEffect, useRef, useState } from "react";

type Detector = new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };

export default function CameraScanner({ onRead }: { onRead: (code: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState("Starting camera…");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const seen = new Map<string, number>();
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.style.cssText = "width:100%;border-radius:12px;margin-top:6px";
    host.current?.appendChild(video);
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: Detector }).BarcodeDetector;
      if (!BD) { setMsg("This browser can't read barcodes — type the code or use a scanner gun (the check digit still protects you)."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        await video.play();
        setMsg("Point the camera at the barcode or QR…");
        const det = new BD({ formats: ["code_128", "code_39", "qr_code", "pdf417"] });
        const loop = async () => {
          if (stop) return;
          try {
            const found = await det.detect(video);
            for (const f of found) {
              const last = seen.get(f.rawValue) ?? 0;
              if (Date.now() - last > 2000) { seen.set(f.rawValue, Date.now()); onRead(f.rawValue); setMsg(`Read ${f.rawValue.length > 40 ? `${f.rawValue.slice(0, 40)}…` : f.rawValue}`); }
            }
          } catch { /* frame not ready yet */ }
          setTimeout(loop, 300);
        };
        void loop();
      } catch { setMsg("Camera not allowed — type the code or use a scanner gun."); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); video.remove(); };
  }, [onRead]);
  return <div ref={host} className="text-xs text-muted">{msg}</div>;
}
