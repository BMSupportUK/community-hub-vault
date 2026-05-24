import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, AlertTriangle, Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type IncidentStatus = "investigating" | "identified" | "monitoring" | "completed";

interface ActiveIncident {
  id: string;
  title: string;
  status: IncidentStatus;
}

const STATUS_META: Record<
  Exclude<IncidentStatus, "completed">,
  { label: string; dot: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  investigating: { label: "Investigating", dot: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]", text: "text-violet-300", icon: Search },
  identified: { label: "Identified", dot: "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]", text: "text-fuchsia-300", icon: AlertTriangle },
  monitoring: { label: "Monitoring", dot: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]", text: "text-blue-300", icon: Eye },
};

export function ServiceStatusBox() {
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("incidents")
      .select("id, title, status")
      .neq("status", "completed")
      .order("created_at", { ascending: false });
    setIncidents((data as ActiveIncident[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`service-status-box-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const operational = incidents.length === 0;

  return (
    <section className="px-6 md:px-10 pb-6 md:pb-10">
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-blue-600/10">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-fuchsia-300" />
            <h2 className="font-display text-sm font-semibold tracking-wide uppercase">Service Status</h2>
          </div>
          <Link
            to="/status"
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-surface-2 border border-border hover:border-fuchsia-400 hover:text-fuchsia-300 transition"
          >
            Read more →
          </Link>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-zinc-500 animate-pulse" />
              Checking status…
            </div>
          ) : operational ? (
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">All systems operational</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {incidents.map((i) => {
                const meta = STATUS_META[i.status as Exclude<IncidentStatus, "completed">] ?? STATUS_META.investigating;
                const Icon = meta.icon;
                return (
                  <li key={i.id} className="flex items-center gap-2.5 text-sm">
                    <span className={`size-2.5 rounded-full ${meta.dot}`} />
                    <Icon className={`size-3.5 ${meta.text}`} />
                    <span className={`font-medium ${meta.text}`}>{meta.label}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-foreground/90">{i.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}