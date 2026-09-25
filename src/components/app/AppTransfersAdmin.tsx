import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  RefreshCw,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listAppTransfers, deleteAppTransferAdmin } from "@/lib/app-transfer.functions";
import { useAuth } from "@/hooks/use-auth";

type Transfer = Awaited<ReturnType<typeof listAppTransfers>>[number];

const STATUS_LABEL: Record<string, string> = {
  downloading: "Downloading",
  completed: "Completed",
  incomplete: "Stopped before finishing",
};

function statusAccent(status: string | null, installed?: boolean) {
  if (installed) return "bg-emerald-300";
  if (status === "completed") return "bg-emerald-400";
  if (status === "downloading") return "bg-sky-400";
  if (status === "incomplete") return "bg-amber-400";
  return "bg-muted-foreground/40";
}

function statusClasses(status: string | null, installed?: boolean) {
  if (installed) return "border-emerald-400/60 bg-emerald-500/25 text-emerald-200";
  if (status === "completed") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  if (status === "downloading") return "border-sky-500/40 bg-sky-500/15 text-sky-300";
  if (status === "incomplete") return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-border bg-surface/70 text-muted-foreground";
}

function mb(bytes: number | null) {
  if (bytes == null) return null;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function TransferCard({
  t,
  canDelete,
  onDelete,
  busy,
}: {
  t: Transfer;
  canDelete: boolean;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const installed = !!t.installedAt;
  const pct = installed
    ? 100
    : t.totalBytes && t.totalBytes > 0
      ? Math.min(100, Math.round((t.bytes / t.totalBytes) * 100))
      : t.status === "completed"
        ? 100
        : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface/80 shadow-sm transition-colors hover:border-primary/40">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${statusAccent(t.status, installed)}`}
      />
      <div className="flex flex-col gap-2 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-foreground">{t.member}</h4>
            <p className="truncate text-xs text-muted-foreground">
              {t.username ? `@${t.username}` : "username unknown"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses(t.status, installed)}`}
          >
            {installed
              ? "Installed & opened"
              : t.status
                ? (STATUS_LABEL[t.status] ?? t.status)
                : t.expired
                  ? "Expired unused"
                  : "Not started"}
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">
          <Smartphone className="size-3.5 shrink-0 text-violet-300" />
          <span className="truncate">{t.appName}</span>
        </p>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5 shrink-0" />
          <span className="sr-only">Link code</span>
          <span className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90 select-all">
            {t.token}
          </span>
        </p>

        <div className="space-y-0.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <p>Link issued {new Date(t.issuedAt).toLocaleString()}</p>
          <p>
            {t.expired ? "Expired" : "Expires"} {new Date(t.expiresAt).toLocaleString()}
          </p>
          {t.startedAt && <p>Download started {new Date(t.startedAt).toLocaleString()}</p>}
          {t.lastDownloadAt && <p>Last activity {new Date(t.lastDownloadAt).toLocaleString()}</p>}
          {t.installedAt && (
            <p className="text-emerald-300">
              Installed &amp; opened {new Date(t.installedAt).toLocaleString()}
              {t.installDevice ? ` on ${t.installDevice}` : ""}
              {t.installAppVersion ? ` · app v${t.installAppVersion}` : ""}
            </p>
          )}
          <p>Downloads started: {t.downloads}</p>
          {(t.device || t.ip) && (
            <p className="truncate">
              <span className="font-medium text-foreground/80">Device:</span> {t.device || "Unknown device"}
              {t.ip ? ` · ${t.ip}` : ""}
            </p>
          )}
          {t.userAgent && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-foreground">
                Details
              </summary>
              <p className="mt-1 break-all text-[11px] text-muted-foreground/80">{t.userAgent}</p>
            </details>
          )}
        </div>

        {t.status && (
          <div className="space-y-1">
            <Progress value={pct} className="h-2" />
            <p className="text-[11px] font-medium text-foreground/80">
              {pct}%
              {t.totalBytes
                ? ` · ${mb(t.bytes)} of ${mb(t.totalBytes)}`
                : t.bytes
                  ? ` · ${mb(t.bytes)}`
                  : ""}
            </p>
          </div>
        )}

        {canDelete && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-1 self-start"
            disabled={busy}
            onClick={() => onDelete(t.id)}
          >
            {busy ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="size-4 mr-1" />
            )}
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/** Staff view of install links split into active, completed and pending/failed transfers. */
export function AppTransfersAdmin() {
  const { hasAny } = useAuth();
  const canDelete = hasAny(["admin", "management"]);
  const queryClient = useQueryClient();
  const listTransfers = useServerFn(listAppTransfers);
  const killTransfer = useServerFn(deleteAppTransferAdmin);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: transfers, isFetching } = useQuery({
    queryKey: ["app-transfers-admin"],
    queryFn: () => listTransfers(),
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Week calendar: offset 0 = this week (Mon–Sun); negative = previous weeks.
  const [weekOffset, setWeekOffset] = useState(0);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );
  const dayCounts = useMemo(
    () =>
      days.map((d) => {
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        return (transfers ?? []).filter((t) => {
          const at = new Date(t.issuedAt);
          return at >= d && at < end;
        }).length;
      }),
    [days, transfers],
  );
  const changeWeek = (next: number) => {
    setWeekOffset(next);
    setDayIdx(next === 0 ? todayIdx : 0);
  };
  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  const groups = useMemo(() => {
    const active: Transfer[] = [];
    const completed: Transfer[] = [];
    const pending: Transfer[] = [];
    const start = days[dayIdx];
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    for (const t of transfers ?? []) {
      const at = new Date(t.issuedAt);
      if (at < start || at >= end) continue;
      if (t.status === "completed") completed.push(t);
      else if (!t.expired) active.push(t);
      else pending.push(t);
    }
    return { active, completed, pending };
  }, [transfers, days, dayIdx]);

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await killTransfer({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["app-transfers-admin"] });
      toast.success("Transfer deleted");
    } catch {
      toast.error("Couldn't delete that transfer");
    } finally {
      setBusyId(null);
    }
  };

  const renderList = (list: Transfer[], empty: string) =>
    !list.length ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-surface/40 px-4 py-10 text-center">
        <Inbox className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <TransferCard
            key={t.id}
            t={t}
            canDelete={canDelete}
            onDelete={onDelete}
            busy={busyId === t.id}
          />
        ))}
      </div>
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-background/90 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-foreground">
              App transfers
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              Live install links, who requested them and how far each download has got. Completed
              transfers are kept, so you can look back at every download.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["app-transfers-admin"] })}
        >
          {isFetching ? (
            <Loader2 className="size-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="size-4 mr-1" />
          )}
          Refresh
        </Button>
      </div>

      <div className="space-y-4 p-5">
        {/* Week calendar */}
        <div className="space-y-3 rounded-xl border border-border bg-surface/80 p-3 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="rounded-lg"
              aria-label="Previous week"
              onClick={() => changeWeek(weekOffset - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{weekLabel}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {weekOffset === 0 ? "This week" : `${-weekOffset} week${weekOffset === -1 ? "" : "s"} ago`}
              </p>
            </div>
            <Button
              size="icon"
              variant="secondary"
              className="rounded-lg"
              aria-label="Next week"
              disabled={weekOffset >= 0}
              onClick={() => changeWeek(weekOffset + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const active = i === dayIdx;
              const isToday = weekOffset === 0 && i === todayIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDayIdx(i)}
                  className={`rounded-lg border px-1 py-1.5 text-center transition-all ${active ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30" : isToday ? "border-primary/50 bg-surface text-foreground hover:bg-primary/10" : "border-border bg-surface/60 text-foreground hover:bg-surface"}`}
                >
                  <span className="block text-xs font-semibold">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="block text-[11px] opacity-80">
                    {d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  <span
                    className={`mx-auto mt-0.5 block w-fit rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-primary-foreground/20" : "bg-primary/15"}`}
                  >
                    {isToday ? "Today · " : ""}
                    {dayCounts[i]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="active">Active transfers ({groups.active.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({groups.completed.length})</TabsTrigger>
            <TabsTrigger value="pending">
              Pending or failed ({groups.pending.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {renderList(groups.active, "No live app transfers right now.")}
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            {renderList(groups.completed, "No completed downloads on this day.")}
          </TabsContent>
          <TabsContent value="pending" className="mt-4">
            {renderList(groups.pending, "Nothing pending or failed.")}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
