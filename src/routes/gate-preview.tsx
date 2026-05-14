import { createFileRoute } from "@tanstack/react-router";
import { Ban, ShieldCheck, LogOut } from "lucide-react";
import bg from "@/assets/gate-bg.jpg";

export const Route = createFileRoute("/gate-preview")({ component: Preview });

function Preview() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.25),transparent_65%)]" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-700 grid place-items-center shadow-[0_0_60px_rgba(34,197,94,0.6)] ring-2 ring-emerald-500/40 mb-6">
          <Ban className="size-10 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight">Access Granted</h1>
        <p className="mt-3 text-emerald-200/90 text-base max-w-md">Welcome aboard. Refreshing your access…</p>
        <button className="mt-6 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-[0_8px_30px_rgba(16,185,129,0.45)] transition-all inline-flex items-center justify-center gap-2">
          <ShieldCheck className="size-4" /> Continue to dashboard
        </button>
      </div>
      <button className="absolute top-4 right-4 z-20 text-xs text-white/40 inline-flex items-center gap-1.5 px-2 py-1 rounded-md">
        <LogOut className="size-3" /> Sign out
      </button>
    </div>
  );
}
