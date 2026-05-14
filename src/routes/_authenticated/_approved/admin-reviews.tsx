import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, X, Star, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-reviews")({
  component: AdminReviewsPage,
});

type Review = {
  id: string;
  user_id: string;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};
type Profile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };

function AdminReviewsPage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rows, setRows] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("customer_reviews")
      .select("id, user_id, rating, title, body, status, created_at, reviewed_at")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Review[];
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
    load();
    const ch = supabase
      .channel("admin-reviews-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_reviews" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase
      .from("customer_reviews")
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Review approved" : "Review rejected");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this review permanently?")) return;
    setBusy(id);
    const { error } = await supabase.from("customer_reviews").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  const filtered = rows.filter((r) => r.status === tab);
  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-purple-200 hover:text-white">
            <ArrowLeft className="size-4" /> Back to Admin Dashboard
          </Link>
        </div>
        <header className="mb-6">
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-violet-400 bg-clip-text text-transparent">Customer Reviews</h1>
          <p className="text-purple-200/80 mt-1">Approve, reject, or remove member feedback before it appears on the wall.</p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-3 max-w-md bg-purple-950/60 border border-purple-500/30">
            <TabsTrigger value="pending" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">
              Pending {counts.pending > 0 && <span className="ml-1 px-1.5 rounded-full bg-fuchsia-500 text-white text-[10px]">{counts.pending}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Rejected ({counts.rejected})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                Nothing here.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const p = profiles[r.user_id];
                  const name = p?.display_name || p?.username || "Member";
                  return (
                    <div key={r.id} className="rounded-2xl bg-purple-950/50 border border-purple-500/30 p-5">
                      <div className="flex items-start gap-4">
                        {p?.avatar_url ? (
                          <img src={p.avatar_url} alt={name} className="size-10 rounded-full object-cover ring-2 ring-fuchsia-500/40" />
                        ) : (
                          <div className="size-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-700 grid place-items-center text-white text-xs font-bold">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="font-semibold text-purple-50">{name}</div>
                              <div className="text-xs text-purple-300/70">{new Date(r.created_at).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star key={n} className={`size-4 ${n <= r.rating ? "fill-fuchsia-400 text-fuchsia-400" : "text-purple-700"}`} />
                              ))}
                            </div>
                          </div>
                          <h3 className="mt-3 font-display font-semibold text-purple-50">{r.title}</h3>
                          <p className="mt-1 text-sm text-purple-100/80 whitespace-pre-wrap">{r.body}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {r.status !== "approved" && (
                              <Button size="sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "approved")} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                                {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 mr-1" />}
                                Approve
                              </Button>
                            )}
                            {r.status !== "rejected" && (
                              <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setStatus(r.id, "rejected")} className="border-rose-400/60 bg-rose-900/20 text-rose-100 hover:bg-rose-800/40">
                                <X className="size-4 mr-1" /> Reject
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => remove(r.id)} className="text-purple-200 hover:text-rose-200 hover:bg-rose-900/30">
                              <Trash2 className="size-4 mr-1" /> Delete
                            </Button>
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