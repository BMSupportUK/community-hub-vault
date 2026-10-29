import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDownloadLog } from "@/lib/download-log.functions";
import { DOWNLOAD_SOURCES, downloadSourceLabel, isWithinPeriod, logMonthLabel, logMonthOptions, logYearOptions } from "@/lib/download-log";

function size(bytes: number | null) {
  if (!bytes) return "—";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Admin/management list of every app download from every route. */
export function DownloadLogAdmin() {
  const fetchLog = useServerFn(listDownloadLog);
  const q = useQuery({ queryKey: ["download-log"], queryFn: () => fetchLog(), refetchInterval: 30_000 });
  const [source, setSource] = useState("all");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [app, setApp] = useState("all");
  const [search, setSearch] = useState("");
  const rows = q.data ?? [];
  const apps = useMemo(() => [...new Set(rows.map((r) => r.appName).filter(Boolean) as string[])].sort(), [rows]);
  const years = useMemo(() => logYearOptions(rows), [rows]);
  const months = useMemo(() => (year === "all" ? [] : logMonthOptions(rows, year)), [rows, year]);
  const shown = rows.filter((r) =>
    isWithinPeriod(r.createdAt, year, month) &&
    (source === "all" || r.source === source) &&
    (app === "all" || r.appName === app) &&
    (!search.trim() || `${r.customer ?? ""} ${r.ip ?? ""} ${r.device ?? ""} ${r.reference ?? ""} ${r.tvAddress ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">Download log</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every app download, newest first. Enabler downloads show a customer once their app sends its Enabler login.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Year">
        <Button role="tab" aria-selected={year === "all"} size="sm" variant={year === "all" ? "default" : "outline"}
          onClick={() => { setYear("all"); setMonth("all"); }}>All years</Button>
        {years.map((y) => (
          <Button key={y} role="tab" aria-selected={year === y} size="sm" variant={year === y ? "default" : "outline"}
            onClick={() => { setYear(y); setMonth("all"); }}>{y}</Button>
        ))}
      </div>
      {year !== "all" && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Month">
          <Button role="tab" aria-selected={month === "all"} size="sm" variant={month === "all" ? "default" : "outline"}
            onClick={() => setMonth("all")}>All months</Button>
          {months.map((m) => (
            <Button key={m} role="tab" aria-selected={month === m} size="sm" variant={month === m ? "default" : "outline"}
              onClick={() => setMonth(m)}>{logMonthLabel(m)}</Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {Object.entries(DOWNLOAD_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={app} onValueChange={setApp}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All apps</SelectItem>
            {apps.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search customer, IP, device, code or TV" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {q.isLoading ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading download log" />
      ) : q.isError ? (
        <p className="text-sm text-destructive">Couldn't load the download log.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No downloads yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th><th className="px-3 py-2">App</th><th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Customer</th><th className="hidden px-3 py-2 md:table-cell">Device</th>
                <th className="hidden px-3 py-2 md:table-cell">IP</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">TV address</th><th className="hidden px-3 py-2 lg:table-cell">Size</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-3 py-2">{r.appName ?? "—"}{r.version ? <span className="text-muted-foreground"> · {r.version}</span> : null}</td>
                  <td className="px-3 py-2">{downloadSourceLabel(r.source)}</td>
                  <td className="px-3 py-2">{r.customer ?? <span className="text-muted-foreground">Not signed in</span>}</td>
                  <td className="hidden px-3 py-2 md:table-cell" title={r.userAgent ?? ""}>{r.device ?? "—"}</td>
                  <td className="hidden px-3 py-2 md:table-cell">{r.ip ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{r.reference ?? "—"}</td>
                  <td className="px-3 py-2">{r.tvAddress ?? "—"}</td>
                  <td className="hidden px-3 py-2 lg:table-cell">{size(r.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
