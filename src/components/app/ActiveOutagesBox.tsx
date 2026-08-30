import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ActiveOutagesBoxProps {
  className?: string;
}

export function ActiveOutagesBox({ className }: ActiveOutagesBoxProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("status_incidents")
        .select("id")
        .neq("status", "completed");
      if (!active) return;
      setCount((data ?? []).length);
    };
    load();
    const ch = supabase
      .channel(`active-outages-box-${Math.random().toString(36).slice(2)}`)
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
    <div
      className={cn(
        "rounded-xl border bg-surface-2/60 p-4 flex items-center gap-3",
        loading
          ? "border-border"
          : operational
            ? "border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
            : "border-red-500 membership-expired-flash",
        className,
      )}
    >
      <div className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 shrink-0">
        {operational ? (
          <CheckCircle2 className="size-5 text-white" />
        ) : !loading ? (
          <AlertTriangle className="size-5 text-white" />
        ) : (
          <Activity className="size-5 text-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Active outages</div>
        <div className="text-sm font-semibold text-foreground leading-tight mt-0.5">
          {loading
            ? "Checking status…"
            : operational
              ? "All systems operational"
              : `${count} active incident${count === 1 ? "" : "s"}`}
        </div>
      </div>
      <Link
        to="/status"
        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-surface border border-border hover:border-fuchsia-400 hover:text-fuchsia-300 transition"
      >
        More details
      </Link>
    </div>
  );
}