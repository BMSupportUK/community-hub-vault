import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Loader2, ShieldCheck, BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listGuideAccessRequests,
  approveGuideAccessRequest,
  declineGuideAccessRequest,
} from "@/lib/guide-access-approvals.functions";

/**
 * Admin/management approval queue for members who asked for access to the
 * install guides or the app download section.
 */
export function GuideAccessApprovals() {
  const queryClient = useQueryClient();
  const list = useServerFn(listGuideAccessRequests);
  const approve = useServerFn(approveGuideAccessRequest);
  const decline = useServerFn(declineGuideAccessRequest);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["guide-access-requests"],
    queryFn: () => list(),
    refetchInterval: 30_000,
  });

  const run = async (
    id: string,
    fn: () => Promise<unknown>,
    okMsg: string,
    errMsg: string,
  ) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(okMsg);
      queryClient.invalidateQueries({ queryKey: ["guide-access-requests"] });
    } catch {
      toast.error(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading access requests…
      </div>
    );
  }

  const rows = data ?? [];
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending access requests right now.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            {r.section === "guides" ? (
              <BookOpen className="size-4 text-violet-300" />
            ) : (
              <Download className="size-4 text-violet-300" />
            )}
            <h3 className="font-semibold text-sm text-foreground truncate">{r.member}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Wants access to {r.section === "guides" ? "the install guides" : "app downloads"}
          </p>
          <p className="text-xs text-muted-foreground">
            Requested {new Date(r.requestedAt).toLocaleString()}
          </p>
          {r.alreadyHasAccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="size-3.5" /> Already has access
            </p>
          )}
          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              disabled={busyId === r.id}
              className="bg-gradient-primary text-primary-foreground hover:opacity-90"
              onClick={() =>
                run(
                  r.id,
                  () => approve({ data: { userId: r.userId, section: r.section } }),
                  "Access granted",
                  "Couldn't grant access",
                )
              }
            >
              {busyId === r.id ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Check className="size-4 mr-1" />
              )}
              Grant access
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busyId === r.id}
              onClick={() =>
                run(
                  r.id,
                  () => decline({ data: { userId: r.userId, section: r.section } }),
                  "Request declined",
                  "Couldn't decline that request",
                )
              }
            >
              <X className="size-4 mr-1" />
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
