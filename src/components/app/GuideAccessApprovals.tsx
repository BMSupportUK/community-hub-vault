import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Loader2, ShieldCheck, BookOpen, Download, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listGuideAccessRequests,
  approveGuideAccessRequest,
  declineGuideAccessRequest,
  listApprovedGuideAccess,
  revokeGuideAccess,
} from "@/lib/guide-access-approvals.functions";

/**
 * Admin/management approval queue for members who asked for access to the
 * install guides or the app download section.
 */
export function GuideAccessApprovals() {
  const [view, setView] = useState<"pending" | "approved">("pending");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("pending")}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${view === "pending" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border hover:border-primary/60"}`}
        >
          Pending requests
        </button>
        <button
          type="button"
          onClick={() => setView("approved")}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${view === "approved" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border hover:border-primary/60"}`}
        >
          Approved members
        </button>
      </div>
      {view === "pending" ? <PendingRequests /> : <ApprovedMembers />}
    </div>
  );
}

function ApprovedMembers() {
  const queryClient = useQueryClient();
  const list = useServerFn(listApprovedGuideAccess);
  const revoke = useServerFn(revokeGuideAccess);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["guide-access-approved"],
    queryFn: () => list(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading approved members…
      </div>
    );
  }

  const rows = data ?? [];
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No members have been approved from here yet.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <div key={r.userId} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {r.section === "guides" ? (
              <BookOpen className="size-4 text-emerald-300" />
            ) : (
              <Download className="size-4 text-emerald-300" />
            )}
            <h3 className="font-semibold text-sm text-foreground truncate">{r.member}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Approved {new Date(r.approvedAt).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.stillHasAccess ? "Access is active" : "Access already removed"}
          </p>
          <div className="mt-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={busyId === r.userId || !r.stillHasAccess}
              onClick={async () => {
                setBusyId(r.userId);
                try {
                  await revoke({ data: { userId: r.userId } });
                  toast.success("Access revoked");
                  queryClient.invalidateQueries({ queryKey: ["guide-access-approved"] });
                } catch {
                  toast.error("Couldn't revoke that member's access");
                } finally {
                  setBusyId(null);
                }
              }}
            >
              {busyId === r.userId ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <UserMinus className="size-4 mr-1" />
              )}
              Revoke access
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingRequests() {
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
