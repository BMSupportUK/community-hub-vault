import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn } from "@/components/app/ChannelColumn";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/moderation")({
  component: ModerationPage,
});

interface AppRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  profile?: { display_name: string | null; username: string | null };
  last_message?: string;
}

function ModerationPage() {
  const { isMod, user } = useAuth();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "denied">("pending");

  const load = async () => {
    const { data: rows } = await supabase
      .from("gate_applications")
      .select("id, user_id, status, created_at")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    if (!rows) return;
    const ids = rows.map((r) => r.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
    const profMap = new Map(profs?.map((p) => [p.id, p]) ?? []);
    setApps(rows.map((r) => ({ ...r, profile: profMap.get(r.user_id) })));
  };

  useEffect(() => {
    if (!isMod) return;
    load();
    const ch = supabase
      .channel("mod-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "gate_applications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMod, filter]);

  if (!isMod) {
    return (
      <main className="flex-1 grid place-items-center">
        <div className="text-center text-muted-foreground">Moderators only.</div>
      </main>
    );
  }

  const decide = async (app: AppRow, decision: "approved" | "denied") => {
    const { error: e1 } = await supabase
      .from("gate_applications")
      .update({ status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    if (e1) return toast.error(e1.message);

    if (decision === "approved") {
      // Remove pending role, add member role
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "pending");
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: app.user_id, role: "member" });
      if (e2 && !e2.message.includes("duplicate")) toast.error(e2.message);
    }
    toast.success(`Application ${decision}`);
    load();
  };

  return (
    <>
      <ChannelColumn
        title="Moderation"
        groups={[{
          label: "Queue",
          items: [
            { to: "/moderation", label: "applications" },
          ],
        }]}
      />
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border px-5 flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          <h1 className="font-display font-semibold">applications</h1>
          <div className="ml-auto flex gap-1 bg-surface-2 p-1 rounded-lg">
            {(["pending", "approved", "denied"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 text-xs rounded-md capitalize ${filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >{s}</button>
            ))}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-3">
            {apps.length === 0 && <div className="text-center text-sm text-muted-foreground py-12">No {filter} applications.</div>}
            {apps.map((a) => (
              <div key={a.id} className="rounded-xl bg-surface border border-border p-4 flex items-center gap-4">
                <div className="size-10 rounded-full bg-gradient-primary grid place-items-center font-semibold text-primary-foreground">
                  {(a.profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{a.profile?.display_name ?? a.profile?.username ?? "User"}</div>
                  <div className="text-xs text-muted-foreground">Applied {new Date(a.created_at).toLocaleString()}</div>
                </div>
                <a href={`/gate?app=${a.id}`} className="text-xs text-primary hover:underline">View chat</a>
                {filter === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => decide(a, "denied")} className="size-9 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 grid place-items-center" title="Deny">
                      <X className="size-4" />
                    </button>
                    <button onClick={() => decide(a, "approved")} className="size-9 rounded-lg bg-success/15 text-success hover:bg-success/25 grid place-items-center" title="Approve">
                      <Check className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
