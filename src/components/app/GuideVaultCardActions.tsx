import { useEffect, useState } from "react";
import { Lock, LockOpen, KeyRound, FileText, Loader2, Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestGuidePasscode,
  unlockGuide,
  getMyGuideAccess,
  getMyActiveGuidePasscode,
  listGuidePasscodes,
  revokeGuidePasscode,
} from "@/lib/guide-vault.functions";


/** Guides the signed-in member currently holds a live passcode for. */
export function useGuideAccess() {
  const fetchAccess = useServerFn(getMyGuideAccess);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["guide-access"],
    queryFn: () => fetchAccess(),
    staleTime: 60 * 1000,
  });

  // Live updates: a new, revoked, or re-issued passcode refreshes the UI
  // immediately without a page reload.
  useEffect(() => {
    const channel = supabase
      .channel("guide-passcodes-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guide_passcodes" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["guide-access"] });
          queryClient.invalidateQueries({ queryKey: ["guide-active-passcode"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Expiry isn't a database event, so fire a one-shot refresh the moment the
  // earliest live code lapses.
  const access = query.data;
  useEffect(() => {
    if (!access?.length) return;
    const next = Math.min(...access.map((a) => new Date(a.expiresAt).getTime()));
    const ms = next - Date.now() + 1000;
    if (ms <= 0) {
      queryClient.invalidateQueries({ queryKey: ["guide-access"] });
      return;
    }
    const t = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["guide-access"] });
      queryClient.invalidateQueries({ queryKey: ["guide-active-passcode"] });
    }, ms);
    return () => clearTimeout(t);
  }, [access, queryClient]);

  return query;
}

type UnlockResult = {
  url: string | null;
  viewUrl: string | null;
  fileName: string | null;
  body: string | null;
};

/**
 * Locked/unlocked controls for a stored guide. A member asks for a passcode
 * (valid 24h), types it in, and only then gets a short-lived download link.
 */
export function GuideVaultCardActions({
  blogId,
  title,
  hasAccess,
  onOpen,
}: {
  blogId: string;
  title: string;
  hasAccess: boolean;
  onOpen: (result: UnlockResult) => void;
}) {
  const queryClient = useQueryClient();
  const request = useServerFn(requestGuidePasscode);
  const unlock = useServerFn(unlockGuide);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);

  const askForCode = async () => {
    setBusy(true);
    try {
      const res = await request({ data: { blogId } });
      toast.success("Passcode issued — valid for 24 hours.", {
        description: "Copy it from the Access code box on the left.",
        duration: 8000,
      });
      setEntering(true);
      queryClient.invalidateQueries({ queryKey: ["guide-access"] });
      queryClient.invalidateQueries({ queryKey: ["guide-active-passcode"] });
    } catch {
      toast.error("Couldn't create a passcode — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await unlock({ data: { blogId, code: code.trim() } });
      if (!res.ok) {
        toast.error("That passcode isn't valid or has expired.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["guide-access"] });
      setEntering(false);
      onOpen({
        url: res.url ?? null,
        viewUrl: res.viewUrl ?? null,
        fileName: res.fileName ?? null,
        body: res.body ?? null,
      });
    } catch {
      toast.error("Couldn't unlock this guide — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const openUnlocked = async () => {
    setBusy(true);
    try {
      // Already holds a live passcode: fetch a fresh link without retyping.
      const res = await unlock({ data: { blogId, code: code.trim() || "" } });
      if (!res.ok) {
        setEntering(true);
        toast.message("Enter your passcode to open this guide.");
        return;
      }
      onOpen({
        url: res.url ?? null,
        viewUrl: res.viewUrl ?? null,
        fileName: res.fileName ?? null,
        body: res.body ?? null,
      });
    } finally {
      setBusy(false);
    }
  };

  if (entering) {
    return (
      <div className="flex-1 flex items-center gap-2">
        <Input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }}
          placeholder="Passcode"
          maxLength={12}
          aria-label={`Passcode for ${title}`}
          className="h-9 font-mono tracking-widest bg-violet-950/50 border-violet-500/30"
        />
        <Button size="sm" onClick={submitCode} disabled={busy} className="bg-gradient-primary text-primary-foreground">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2">
      {hasAccess ? (
        <Button
          size="sm"
          onClick={openUnlocked}
          disabled={busy}
          className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90"
        >
          {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <LockOpen className="size-4 mr-1" />}
          Open guide
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            onClick={askForCode}
            disabled={busy}
            className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <KeyRound className="size-4 mr-1" />}
            Request passcode
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-violet-200 hover:bg-surface-2/80 hover:text-foreground"
            onClick={() => setEntering(true)}
            title="I already have a passcode"
          >
            <Lock className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Persistent "Access code" box: shows the member's live passcode with a copy
 * button. Hides itself and prompts for a new code once it expires.
 */
export function GuideAccessCodeBox() {
  const fetchCode = useServerFn(getMyActiveGuidePasscode);
  const { data } = useQuery({
    queryKey: ["guide-active-passcode"],
    queryFn: () => fetchCode(),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  return (
    <div className="mt-4 border-t border-border pt-3 px-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <KeyRound className="size-3.5" /> Access code
      </h4>
      {data ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-950/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-lg tracking-[0.3em] text-foreground">{data.code}</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-violet-200 hover:text-foreground hover:bg-surface-2/80"
              title="Copy access code"
              onClick={() => {
                navigator.clipboard.writeText(data.code);
                toast.success("Access code copied");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Expires {new Date(data.expiresAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No active code. Request a passcode on any guide to unlock it for 24 hours.
        </p>
      )}
    </div>
  );
}

export function GuideLockBadge({ unlocked }: { unlocked: boolean }) {
  return (
    <span
      className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-semibold flex items-center gap-1 ${
        unlocked
          ? "bg-emerald-500/90 text-emerald-950"
          : "bg-background/80 text-foreground border border-primary/40"
      }`}
    >
      {unlocked ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
      {unlocked ? "Unlocked" : "Locked"}
    </span>
  );
}

export function GuideFileIcon() {
  return <FileText className="size-10" />;
}

/** Admin/management panel listing live guide passcodes with a revoke action. */
export function GuidePasscodeAdmin() {
  const queryClient = useQueryClient();
  const list = useServerFn(listGuidePasscodes);
  const revoke = useServerFn(revokeGuidePasscode);
  const { data, isLoading } = useQuery({
    queryKey: ["guide-passcodes"],
    queryFn: () => list(),
    staleTime: 30 * 1000,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const onRevoke = async (id: string) => {
    setBusyId(id);
    try {
      await revoke({ data: { id } });
      toast.success("Passcode revoked");
      queryClient.invalidateQueries({ queryKey: ["guide-passcodes"] });
    } catch {
      toast.error("Couldn't revoke that passcode");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading passcodes…
      </div>
    );
  }

  const rows = data ?? [];
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No live guide passcodes right now.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1.5">
          <h3 className="font-semibold text-sm text-foreground">{r.guide}</h3>
          <p className="text-xs text-muted-foreground">{r.member}</p>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(r.expiresAt).toLocaleString()}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 self-start"
            disabled={busyId === r.id}
            onClick={() => onRevoke(r.id)}
          >
            {busyId === r.id ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Lock className="size-4 mr-1" />}
            Revoke
          </Button>
        </div>
      ))}
    </div>
  );
}

