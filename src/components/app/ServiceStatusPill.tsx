import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "completed";

export function ServiceStatusPill({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("status_incidents")
        .select("id, status")
        .neq("status", "completed");
      if (!active) return;
      setCount((data ?? []).length);
    };
    load();
    const ch = supabase
      .channel(`service-status-pill-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const loading = count === null;
  const operational = count === 0;

  return (
    <Link
      to="/status"
      className={cn(
        "inline-flex items-center gap-3 self-start rounded-xl border-2 px-4 py-3 text-sm font-medium text-white backdrop-blur transition",
        loading
          ? "border-white/40 bg-white/10 hover:bg-white/20"
          : operational
            ? "border-emerald-300/60 bg-emerald-500/15 hover:bg-emerald-500/25 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
            : "border-red-300/60 bg-red-500/15 hover:bg-red-500/25 shadow-[0_0_24px_rgba(239,68,68,0.3)]",
        className,
      )}
    >
      <span className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600">
        <Activity className="size-4 text-white" />
      </span>
      <span>
        <span className="block text-white">Service Status</span>
        <span className="block text-[11px] text-sky-50/90">
          {loading ? "Checking…" : operational ? "All systems operational" : `${count} active incident${count === 1 ? "" : "s"}`}
        </span>
      </span>
      <span
        className={cn(
          "ml-2 size-2 rounded-full",
          loading
            ? "bg-zinc-400"
            : operational
              ? "bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60"
              : "bg-red-400 shadow-[0_0_12px] shadow-red-400/60 animate-pulse",
        )}
      />
    </Link>
  );
}