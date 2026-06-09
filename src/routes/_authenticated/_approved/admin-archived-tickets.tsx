import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArchiveRestore, Trash2, Loader2, LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-archived-tickets")({
  component: AdminArchivedTicketsPage,
});

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  closed_at: string | null;
  archived_at: string | null;
};
type Profile = { id: string; display_name: string | null; username: string | null };

function AdminArchivedTicketsPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("tickets")
      .select("id, user_id, subject, status, priority, assigned_to, created_at, closed_at, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    const list = (data ?? []) as Ticket[];
    setRows(list);
    setLoading(false);
    const ids = Array.from(new Set(list.flatMap((t) => [t.user_id, t.assigned_to]).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => (map[(p as Profile).id] = p as Profile));
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const unarchive = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("tickets").update({ archived_at: null }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Ticket restored to ticket list");
    setRows((r) => r.filter((t) => t.id !== id));
  };

  const remove = async (id: string) => {
    if (!confirm("Permanently delete this ticket and all its messages?")) return;
    setBusy(id);
    const { error } = await supabase.from("tickets").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Ticket deleted");
    setRows((r) => r.filter((t) => t.id !== id));
  };

  const nameFor = (id: string | null) => {
    if (!id) return "—";
    const p = profiles[id];
    return p?.display_name || p?.username || "Member";
  };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-purple-200 hover:text-white">
            <ArrowLeft className="size-4" /> Back to Admin Dashboard
          </Link>
        </div>
        <header className="mb-6">
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
            Archived Tickets
          </h1>
          <p className="text-purple-200/80 mt-1">
            Tickets are auto-archived 7 days after they are closed. They are hidden from the tickets page but kept here for reference.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-purple-200/80">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading archive…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-10 text-center text-purple-200/80">
            <LifeBuoy className="size-8 mx-auto mb-3 opacity-60" />
            No archived tickets yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border-2 border-purple-500/40 bg-purple-950/40 p-4 shadow-md shadow-purple-900/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <LifeBuoy className="size-4 text-fuchsia-300" />
                      <h3 className="font-display text-lg text-white truncate">{t.subject}</h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-purple-200/80">
                      <div><span className="text-purple-300/60">Raised by:</span> {nameFor(t.user_id)}</div>
                      <div><span className="text-purple-300/60">Assigned:</span> {nameFor(t.assigned_to)}</div>
                      <div><span className="text-purple-300/60">Status:</span> {t.status} · {t.priority}</div>
                      <div><span className="text-purple-300/60">Opened:</span> {fmt(t.created_at)}</div>
                      <div><span className="text-purple-300/60">Closed:</span> {fmt(t.closed_at)}</div>
                      <div><span className="text-purple-300/60">Archived:</span> {fmt(t.archived_at)}</div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === t.id}
                      onClick={() => unarchive(t.id)}
                      className="border-fuchsia-500/40 text-fuchsia-100 hover:bg-fuchsia-500/20"
                    >
                      <ArchiveRestore className="size-4 mr-1" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === t.id}
                      onClick={() => remove(t.id)}
                    >
                      <Trash2 className="size-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}