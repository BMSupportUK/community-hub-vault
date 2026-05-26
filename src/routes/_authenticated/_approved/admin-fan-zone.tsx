import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, X, RotateCcw, Trophy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-fan-zone")({
  component: AdminFanZonePage,
});

type Status = "pending" | "approved" | "rejected" | "revoked";
type Row = {
  user_id: string;
  status: Status;
  requested_at: string;
  decided_at: string | null;
  reason: string | null;
  note: string | null;
};
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function AdminFanZonePage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tab, setTab] = useState<Status>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("fan_zone_members")
      .select("user_id, status, requested_at, decided_at, reason, note")
      .order("requested_at", { ascending: false });
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => (map[(p as Profile).id] = p as Profile));
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const ch = supabase
      .channel("admin-fan-zone-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fan_zone_members" },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const decide = async (userId: string, status: "approved" | "rejected" | "revoked") => {
    setBusy(userId);
    const note = notes[userId]?.trim() ? notes[userId].trim().slice(0, 280) : null;
    const { error } = await supabase
      .from("fan_zone_members")
      .update({
        status,
        note,
        decided_at: new Date().toISOString(),
        decided_by: user?.id ?? null,
      })
      .eq("user_id", userId);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved"
        ? "Approved — welcome to the zone."
        : status === "rejected"
          ? "Request declined."
          : "Access revoked.",
    );
    setNotes((n) => ({ ...n, [userId]: "" }));
    void load();
  };

  const filtered = rows.filter((r) => r.status === tab);
  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    revoked: rows.filter((r) => r.status === "revoked").length,
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to Admin Dashboard
          </Link>
        </div>
        <header className="mb-6 flex items-start gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-rose-600 to-amber-600 grid place-items-center text-white shadow-glow">
            <Trophy className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Boro Fan Zone Requests</h1>
            <p className="text-muted-foreground mt-1">Approve, reject or revoke Middlesbrough F.C. fan-zone access.</p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
          <TabsList className="grid grid-cols-4 max-w-lg">
            <TabsTrigger value="pending">
              Pending{counts.pending > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-amber-500 text-white text-[10px]">{counts.pending}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="revoked">Revoked ({counts.revoked})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                Nothing here.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const p = profiles[r.user_id];
                  const name = p?.display_name || p?.username || "Member";
                  return (
                    <div key={r.user_id} className="rounded-2xl bg-surface-1 border border-border p-5">
                      <div className="flex items-start gap-4">
                        {p?.avatar_url ? (
                          <img src={p.avatar_url} alt={name} className="size-10 rounded-full object-cover ring-2 ring-amber-500/40" />
                        ) : (
                          <div className="size-10 rounded-full bg-gradient-to-br from-rose-600 to-amber-600 grid place-items-center text-white text-xs font-bold">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <Link to="/u/$username" params={{ username: p?.username ?? "" }} className="font-semibold hover:underline">
                                {name}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {tab === "pending" ? "Requested" : "Last decision"}:{" "}
                                {new Date(r.decided_at ?? r.requested_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {r.reason && (
                            <p className="mt-3 text-sm whitespace-pre-wrap bg-surface-2/60 border border-border rounded-md p-3">
                              {r.reason}
                            </p>
                          )}
                          {r.note && r.status !== "pending" && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Admin note: <span className="italic">{r.note}</span>
                            </p>
                          )}
                          {r.status === "pending" && (
                            <Input
                              value={notes[r.user_id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [r.user_id]: e.target.value.slice(0, 280) }))}
                              placeholder="Optional note shown on rejection (not on approval)"
                              className="mt-3 h-9 text-xs"
                            />
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            {r.status !== "approved" && (
                              <Button
                                size="sm"
                                disabled={busy === r.user_id}
                                onClick={() => decide(r.user_id, "approved")}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                              >
                                {busy === r.user_id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Check className="size-4 mr-1" />}
                                Approve
                              </Button>
                            )}
                            {r.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === r.user_id}
                                onClick={() => decide(r.user_id, "rejected")}
                              >
                                <X className="size-4 mr-1" /> Reject
                              </Button>
                            )}
                            {r.status === "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === r.user_id}
                                onClick={() => decide(r.user_id, "revoked")}
                                className="border-rose-400/60 text-rose-200 hover:bg-rose-900/30"
                              >
                                <RotateCcw className="size-4 mr-1" /> Revoke
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}