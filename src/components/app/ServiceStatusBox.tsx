import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, Clock, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatLastSeen } from "@/lib/relative-time";

interface ServiceStatusBoxProps {
  hideButtons?: boolean;
}

type IncidentStatus = "investigating" | "identified" | "monitoring" | "completed";

interface IncidentUpdate {
  id: string;
  status: IncidentStatus;
  message: string;
  created_at: string;
}

interface ActiveIncident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  latest_update: IncidentUpdate | null;
}

const STATUS_META: Record<
  Exclude<IncidentStatus, "completed">,
  { label: string; dot: string; text: string; border: string }
> = {
  investigating: { label: "Investigating", dot: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]", text: "text-violet-300", border: "border-violet-500/40" },
  identified: { label: "Identified", dot: "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]", text: "text-fuchsia-300", border: "border-fuchsia-500/40" },
  monitoring: { label: "Monitoring", dot: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]", text: "text-blue-300", border: "border-blue-500/40" },
};

export function ServiceStatusBox({ hideButtons }: ServiceStatusBoxProps = {}) {
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: incidentsData } = await supabase
      .from("status_incidents")
      .select("id, title, description, status, created_at, updated_at, resolved_at")
      .neq("status", "completed")
      .order("created_at", { ascending: false });

    const rawIncidents = (incidentsData as Omit<ActiveIncident, "latest_update">[] | null) ?? [];

    // Fetch latest update for each incident
    const incidentsWithUpdates: ActiveIncident[] = await Promise.all(
      rawIncidents.map(async (inc) => {
        const { data: upd } = await supabase
          .from("status_incident_updates")
          .select("id, status, message, created_at")
          .eq("incident_id", inc.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        return { ...inc, latest_update: (upd as IncidentUpdate | null) ?? null };
      })
    );

    setIncidents(incidentsWithUpdates);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`service-status-box-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incident_updates" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const operational = incidents.length === 0;

  return (
    <section className="px-2 pt-4">
      <div
        className={cn(
          "rounded-xl bg-surface-2/60 border overflow-hidden",
          loading
            ? "border-border"
            : operational
              ? "border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
              : "membership-expired-flash border-red-500",
        )}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-blue-600/10">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-fuchsia-300" />
            <h2 className="font-display text-xs font-bold tracking-wider uppercase">Service Status</h2>
          </div>
          {!operational && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              {incidents.length} ACTIVE
            </span>
          )}
        </div>
        <div className="px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-zinc-500 animate-pulse" />
              Checking status…
            </div>
          ) : operational ? (
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              <span className="text-sm font-medium text-emerald-300">All Systems Operational</span>
            </div>
          ) : (
            <ul className="space-y-4">
              {incidents.map((i) => {
                const meta = STATUS_META[i.status as Exclude<IncidentStatus, "completed">] ?? STATUS_META.investigating;
                return (
                  <li key={i.id} className={cn("rounded-lg border p-3 space-y-2", meta.border, "bg-surface/40")}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 size-2.5 rounded-full shrink-0 ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.border} ${meta.text} bg-surface`}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {relativeTime(new Date(i.created_at))}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-foreground mt-1 leading-snug">{i.title}</div>
                        {i.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.description}</div>
                        )}
                      </div>
                    </div>

                    {i.latest_update && (
                      <div className="rounded-md bg-surface-2/60 border border-border p-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <MessageSquare className="size-3" />
                          <span className="uppercase tracking-wider font-medium">Latest update</span>
                          <span>· {relativeTime(new Date(i.latest_update.created_at))}</span>
                        </div>
                        <div className="text-xs text-foreground/90 line-clamp-2 whitespace-pre-wrap">{i.latest_update.message}</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!operational && (
            <Link
              to="/status"
              className="block text-center text-xs font-medium px-3 py-2 rounded-lg bg-surface border border-border hover:border-fuchsia-400 hover:text-fuchsia-300 transition"
            >
              View full status page →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
