import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, Users, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ServiceStatusBoxProps {
  hideButtons?: boolean;
}

type IncidentStatus = "investigating" | "identified" | "monitoring" | "completed";

interface ActiveIncident {
  id: string;
  title: string;
  status: IncidentStatus;
}

const STATUS_META: Record<
  Exclude<IncidentStatus, "completed">,
  { label: string; dot: string; text: string }
> = {
  investigating: { label: "Investigating", dot: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]", text: "text-violet-300" },
  identified: { label: "Identified", dot: "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]", text: "text-fuchsia-300" },
  monitoring: { label: "Monitoring", dot: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]", text: "text-blue-300" },
};

export function ServiceStatusBox({ hideButtons }: ServiceStatusBoxProps = {}) {
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("status_incidents")
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
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const operational = incidents.length === 0;

  return (
    <section className="px-2 pt-4">
      <div className="rounded-lg bg-surface-2/60 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-blue-600/10">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-fuchsia-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">Service Status</h2>
          </div>
        </div>
        <div className="px-3 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-zinc-500 animate-pulse" />
              Checking status…
            </div>
          ) : operational ? (
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-medium text-emerald-300">Operational</span>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {incidents.map((i) => {
                const meta = STATUS_META[i.status as Exclude<IncidentStatus, "completed">] ?? STATUS_META.investigating;
                return (
                  <li key={i.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 size-2 rounded-full shrink-0 ${meta.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold ${meta.text}`}>{meta.label}</div>
                      <div className="truncate text-foreground/80">{i.title}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/status"
            className="block text-center text-[11px] font-medium px-2 py-1.5 rounded-md bg-surface border border-border hover:border-fuchsia-400 hover:text-fuchsia-300 transition"
          >
            Read more →
          </Link>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link
          to="/members"
          title="Members directory"
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-[11px] font-medium shadow shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 transition-shadow"
        >
          <Users className="size-3.5" />
          Members
        </Link>
        <Link
          to="/staff"
          title="Staff directory"
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-[11px] font-medium shadow shadow-blue-500/20 hover:shadow-blue-500/40 transition-shadow"
        >
          <Briefcase className="size-3.5" />
          Staff
        </Link>
      </div>
    </section>
  );
}