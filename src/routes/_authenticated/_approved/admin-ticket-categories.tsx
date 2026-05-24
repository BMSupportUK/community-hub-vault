import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowLeft, Loader2, LifeBuoy, CreditCard, Bug, Sparkles, UserCog, Tv, Film, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_approved/admin-ticket-categories")({
  component: AdminTicketCategoriesPage,
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LifeBuoy, CreditCard, Bug, Sparkles, UserCog, Tv, Film,
};

interface Cat {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  sort_order: number;
}

function AdminTicketCategoriesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data, error } = await supabase
        .from("ticket_categories")
        .select("id, name, slug, description, icon, sort_order")
        .order("sort_order", { ascending: true });
      if (error) toast.error(error.message);
      else setCats((data ?? []) as Cat[]);
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const update = (id: string, patch: Partial<Cat>) =>
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const save = async (c: Cat) => {
    setSavingId(c.id);
    const { error } = await supabase
      .from("ticket_categories")
      .update({ name: c.name, description: c.description })
      .eq("id", c.id);
    setSavingId(null);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to admin
        </Link>
        <h1 className="font-display text-2xl font-bold mb-1">Ticket categories</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Edit the name and description shown to members when they open a new support ticket.
        </p>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {cats.map((c) => {
              const Icon = ICONS[c.icon] ?? LifeBuoy;
              return (
                <div key={c.id} className="rounded-2xl border border-border bg-surface-1 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="size-10 rounded-xl bg-surface-2 grid place-items-center shrink-0">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{c.slug}</div>
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Name</label>
                  <input
                    value={c.name}
                    maxLength={80}
                    onChange={(e) => update(c.id, { name: e.target.value })}
                    className="w-full mb-3 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm"
                  />
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</label>
                  <textarea
                    value={c.description ?? ""}
                    maxLength={240}
                    rows={2}
                    onChange={(e) => update(c.id, { description: e.target.value })}
                    className="w-full mb-3 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm resize-none"
                    placeholder="Short description shown to members"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => save(c)}
                      disabled={savingId === c.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
                    >
                      {savingId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}