import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCw, Smartphone } from "lucide-react";
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

function statusClasses(status: string | null) {
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
  const pct =
    t.totalBytes && t.totalBytes > 0
      ? Math.min(100, Math.round((t.bytes / t.totalBytes) * 100))
      : t.status === "completed"
        ? 100
        : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-sm text-foreground truncate">{t.member}</h4>
          <p className="text-xs text-muted-foreground truncate">
            {t.username ? `@${t.username}` : "username unknown"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses(t.status)}`}
        >
          {t.status ? (STATUS_LABEL[t.status] ?? t.status) : t.expired ? "Expired unused" : "Not started"}
        </span>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-foreground/85">
        <Smartphone className="size-3.5 text-violet-300 shrink-0" />
        <span className="truncate">{t.appName}</span>
      </p>
      <p className="text-xs text-muted-foreground break-all">
        Link code: <span className="font-mono text-foreground/85">{t.token}</span>
      </p>

      <p className="text-xs text-muted-foreground">
        Link issued {new Date(t.issuedAt).toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">
        {t.expired ? "Expired" : "Expires"} {new Date(t.expiresAt).toLocaleString()}
      </p>
      {t.startedAt && (
        <p className="text-xs text-muted-foreground">
          Download started {new Date(t.startedAt).toLocaleString()}
        </p>
      )}
      {t.lastDownloadAt && (
        <p className="text-xs text-muted-foreground">
          Last activity {new Date(t.lastDownloadAt).toLocaleString()}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Downloads started: {t.downloads}</p>

      {(t.device || t.userAgent) && (
        <div className="text-xs text-muted-foreground">
          <p className="truncate">
            <span className="font-medium text-foreground/80">Device:</span>{" "}
            {t.device || "Unknown device"}
            {t.ip ? ` \u00b7 ${t.ip}` : ""}
          </p>
          {t.userAgent && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-foreground">
                Details
              </summary>
              <p className="mt-1 break-all text-[11px] text-muted-foreground/80">{t.userAgent}</p>
            </details>
          )}
        </div>
      )}

      {t.status && (
        <div className="mt-1 space-y-1">
          <Progress value={pct} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
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
          className="mt-2 self-start"
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

  const groups = useMemo(() => {
    const active: Transfer[] = [];
    const completed: Transfer[] = [];
    const pending: Transfer[] = [];
    for (const t of transfers ?? []) {
      if (t.status === "completed") completed.push(t);
      else if (!t.expired) active.push(t);
      else pending.push(t);
    }
    return { active, completed, pending };
  }, [transfers]);

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
      <p className="text-sm text-muted-foreground">{empty}</p>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">App transfers</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="inline-flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            Live install links, who requested them and how far each download has got. Completed
            transfers are removed automatically 24 hours after a successful download.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
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
          {renderList(groups.completed, "No completed downloads in the last 24 hours.")}
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          {renderList(groups.pending, "Nothing pending or failed.")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
