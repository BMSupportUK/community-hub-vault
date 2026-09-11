import { Loader2 } from "lucide-react";
import bmLogo from "@/assets/bm-support-logo.png.asset.json";

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
      <img
        src={bmLogo.url}
        alt="BM Support"
        className="size-32 rounded-full drop-shadow-[0_18px_70px_rgba(220,38,38,0.45)] sm:size-40"
      />


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
