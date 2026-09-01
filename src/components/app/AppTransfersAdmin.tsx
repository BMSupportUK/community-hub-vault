import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { listAppTransfers, deleteAppTransferAdmin } from "@/lib/app-transfer.functions";
import { useAuth } from "@/hooks/use-auth";

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

/** Staff view of the live 24-hour install links and their download progress. */
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
    refetchInterval: 5_000,
    staleTime: 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">Active transfers</h3>
          <p className="text-sm text-muted-foreground">
            Live 24-hour install links, who requested them and how far each download has got.
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

      {!transfers?.length ? (
        <p className="text-sm text-muted-foreground">No live app transfers right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {transfers.map((t) => {
            const pct =
              t.totalBytes && t.totalBytes > 0
                ? Math.min(100, Math.round((t.bytes / t.totalBytes) * 100))
                : t.status === "completed"
                  ? 100
                  : 0;
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1.5"
              >
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
                    {t.status ? (STATUS_LABEL[t.status] ?? t.status) : "Not started"}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Link issued {new Date(t.issuedAt).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(t.expiresAt).toLocaleString()}
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
                    disabled={busyId === t.id}
                    onClick={async () => {
                      setBusyId(t.id);
                      try {
                        await killTransfer({ data: { id: t.id } });
                        await queryClient.invalidateQueries({ queryKey: ["app-transfers-admin"] });
                        toast.success("Transfer deleted");
                      } catch {
                        toast.error("Couldn't delete that transfer");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {busyId === t.id ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 mr-1" />
                    )}
                    Delete
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
