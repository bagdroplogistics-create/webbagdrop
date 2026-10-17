import Inbox from "./Inbox";

/** Admin OS shell — modules migrate from the static build into this layout
 *  one at a time. The static admin keeps working on the same backend until
 *  every module has moved. */
const MODULES = [
  { name: "Shipments", live: true },
  { name: "Quotes & payments", live: false },
  { name: "LR & trips", live: false },
  { name: "CRM", live: false },
  { name: "Pricing", live: false },
  { name: "Finance", live: false },
  { name: "Reports / MIS", live: false },
];

export default function AdminPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">B</span>
            <span className="font-display text-base font-extrabold tracking-tight">BAGDROP <span className="text-brand">Admin OS</span></span>
            <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">NEXT · MIGRATION IN PROGRESS</span>
          </span>
          <span className="text-xs text-muted">Full console: the static Admin OS, same backend</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-5 flex flex-wrap gap-1.5">
          {MODULES.map((m) => (
            <span key={m.name}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${m.live ? "bg-brand text-white" : "bg-paper text-faint"}`}
              title={m.live ? "Migrated" : "Still on the static Admin OS"}>
              {m.name}{!m.live && " ·"}
            </span>
          ))}
        </nav>
        <Inbox />
      </main>
    </div>
  );
}
