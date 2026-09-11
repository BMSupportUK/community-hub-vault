import { Loader2 } from "lucide-react";

/**
 * Full-screen BM Support splash shown while we work out whether the visitor is
 * signed in (and whether their screen is locked) on a cold start / app relaunch.
 */
export function BmSplash({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-6 bg-background"
      style={{
        background:
          "radial-gradient(900px 500px at 50% 20%, rgba(220,38,38,0.28), transparent 65%), linear-gradient(160deg, #170606 0%, #0a0a0a 60%, #000 100%)",
      }}
    >
      <div
        className="grid size-24 place-items-center rounded-3xl border border-red-400/40 shadow-[0_18px_70px_rgba(220,38,38,0.45)]"
        style={{
          background:
            "linear-gradient(135deg, rgba(248,113,113,0.35) 0%, rgba(127,29,29,0.9) 100%)",
        }}
      >
        <span className="font-display text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          BM
        </span>
      </div>

      <div className="text-center">
        <div className="font-display text-xl font-bold tracking-wide text-white">BM Support</div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-red-100/80">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </div>
      </div>
    </div>
  );
}
