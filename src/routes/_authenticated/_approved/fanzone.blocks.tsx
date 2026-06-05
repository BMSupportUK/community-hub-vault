import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/blocks")({
  component: BlocksPage,
});

type Row = { blocked_id: string; fan_alias: string; fan_avatar_url: string; created_at: string };

function BlocksPage() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("list_my_fan_blocks");
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { if (canEnter) void load(); }, [canEnter]);

  const unblock = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("fan_zone_unblock", { _other: id });
    setBusy(null);
    if (error) return toast.error("Couldn't unblock", { description: error.message });
    toast.success("Unblocked");
    void load();
  };

  if (!canEnter) return <div className="p-6 text-sm text-center">Members only.</div>;

  return (
    <div className="boro-theme max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/fanzone/messages"><ArrowLeft className="size-4 mr-1" />Back to inbox</Link>
      </Button>
      <header>
        <h1 className="font-display text-2xl font-bold">Ignore list</h1>
        <p className="text-sm text-muted-foreground">Members you've blocked. Their posts and topics are hidden from you, and you can't message each other. Unblock here or from their mini profile.</p>
      </header>

      {rows === null ? (
        <div className="grid place-items-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">You haven't blocked anyone.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.blocked_id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
              <img src={r.fan_avatar_url} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/10" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.fan_alias}</div>
                <div className="text-[11px] text-muted-foreground">Blocked {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <Button size="sm" variant="outline" disabled={busy === r.blocked_id} onClick={() => void unblock(r.blocked_id)}>
                <ShieldOff className="size-4 mr-1" /> Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}