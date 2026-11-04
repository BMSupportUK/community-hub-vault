import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ConnectionReport = { id: string; device_id: string; iptv_username: string | null; active_connections: number; max_connections: number; created_at: string; app_version: string | null };

/** Reports from BM Player apps that saw a login over its connection limit for 3 minutes. */
export function ConnectionLimitSection() {
  const [reports, setReports] = useState<ConnectionReport[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data } = await supabase.from("player_connection_reports")
        .select("id, device_id, iptv_username, active_connections, max_connections, created_at, app_version")
        .order("created_at", { ascending: false }).limit(100);
      if (!stop) setReports((data ?? []) as ConnectionReport[]);
    };
    void load();
    const poll = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(poll); };
  }, []);
  return <section className="rounded-xl border border-border bg-surface p-5">
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-warning" />Connection limit investigations</h2>
    {reports === null ? <p className="text-sm text-muted-foreground">Loading…</p> : reports.length === 0 ? <p className="text-sm text-muted-foreground">No connection limit reports.</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Reported</th><th className="p-3">Code</th><th className="p-3">Login</th><th className="p-3">Connections</th><th className="p-3">Version</th></tr></thead>
        <tbody>{reports.map((report) => <tr key={report.id} className="border-b border-border">
          <td className="p-3">{new Date(report.created_at).toLocaleString("en-GB")}</td>
          <td className="p-3 font-mono">{report.device_id.slice(0, 8).toUpperCase()}</td>
          <td className="p-3">{report.iptv_username || "Unknown"}</td>
          <td className="p-3 font-semibold text-warning">{report.active_connections} / {report.max_connections}</td>
          <td className="p-3">{report.app_version || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
