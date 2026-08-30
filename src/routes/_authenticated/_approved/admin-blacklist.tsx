import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Loader2, Plus, Trash2, Mail, Globe } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { addBlacklist, listBlacklist, removeBlacklist } from "@/lib/blacklist.functions";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_approved/admin-blacklist")({
  component: AdminBlacklistPage,
});

interface Entry {
  id: string;
  kind: "email" | "ip";
  value: string;
  reason: string | null;
  created_at: string;
}

function AdminBlacklistPage() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const list = useServerFn(listBlacklist);
  const add = useServerFn(addBlacklist);
  const remove = useServerFn(removeBlacklist);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"email" | "ip">("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"email" | "ip">("email");

  const load = async () => {
    setLoading(true);
    try {
      const res = await list();
      setEntries((res.entries ?? []) as Entry[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load blacklist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = supabase
      .channel("blacklist-entries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "blacklist_entries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-blacklist" } as never} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setSaving(true);
    try {
      const res = await add({ data: { kind, value: v, reason: reason.trim() || undefined } });
      if ((res as any).duplicate) {
        toast.info("That entry is already on the blacklist.");
      } else {
        toast.success(
          res.banned > 0
            ? `Added — ${res.banned} matching user${res.banned === 1 ? "" : "s"} banned.`
            : "Added to blacklist.",
        );
      }
      setValue("");
      setReason("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Remove this entry from the blacklist?")) return;
    try {
      await remove({ data: { id } });
      setEntries((prev) => prev.filter((x) => x.id !== id));
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove");
    }
  };

  const emails = entries.filter((e) => e.kind === "email");
  const ips = entries.filter((e) => e.kind === "ip");

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>

        <header className="rounded-3xl overflow-hidden border border-destructive/30 bg-gradient-to-br from-destructive/15 via-background to-background p-6">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-destructive/20 grid place-items-center">
              <Ban className="size-6 text-destructive" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Blacklist</h1>
              <p className="text-sm text-muted-foreground">
                Ban accounts by email address or IP. Matching users are banned immediately and any new signup with a
                blacklisted email or IP is auto-banned.
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={submit} className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
          <div className="grid sm:grid-cols-[140px_1fr] gap-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "email" | "ip")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="email">Email</option>
              <option value="ip">IP address</option>
            </select>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "email" ? "user@example.com" : "203.0.113.42"}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              maxLength={255}
              required
            />
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add to blacklist
          </button>
        </form>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "ip")}>
            <TabsList>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="size-4" /> Blocked emails ({emails.length})
              </TabsTrigger>
              <TabsTrigger value="ip" className="gap-2">
                <Globe className="size-4" /> Blocked IPs ({ips.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <EntryCards items={emails} icon={Mail} onRemove={onRemove} empty="No blocked emails yet." />
            </TabsContent>
            <TabsContent value="ip" className="mt-4">
              <EntryCards items={ips} icon={Globe} onRemove={onRemove} empty="No blocked IPs yet." />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}

function EntryCards({
  items,
  icon: Icon,
  onRemove,
  empty,
}: {
  items: Entry[];
  icon: any;
  onRemove: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-1 p-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => (
        <div key={it.id} className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="size-8 shrink-0 rounded-lg bg-destructive/15 grid place-items-center">
              <Icon className="size-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0 font-mono text-sm break-all">{it.value}</div>
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              title="Remove"
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {it.reason && <p className="text-xs text-muted-foreground break-words">{it.reason}</p>}
          <p className="text-[11px] text-muted-foreground mt-auto">
            Added {new Date(it.created_at).toLocaleString("en-GB")}
          </p>
        </div>
      ))}
    </div>
  );
}
