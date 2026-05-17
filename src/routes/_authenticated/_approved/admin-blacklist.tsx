import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Loader2, Plus, Trash2, Mail, Globe } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { addBlacklist, listBlacklist, removeBlacklist } from "@/lib/blacklist.functions";
import { toast } from "sonner";

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
    if (isAdmin) load();
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
      toast.success(
        res.banned > 0
          ? `Added — ${res.banned} matching user${res.banned === 1 ? "" : "s"} banned.`
          : "Added to blacklist.",
      );
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
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
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
          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Blocked emails" icon={Mail} items={emails} onRemove={onRemove} />
            <Section title="Blocked IPs" icon={Globe} items={ips} onRemove={onRemove} />
          </div>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  onRemove,
}: {
  title: string;
  icon: any;
  items: Entry[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
        <Icon className="size-4" /> {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm break-all">{it.value}</div>
                {it.reason && <div className="text-xs text-muted-foreground mt-0.5">{it.reason}</div>}
                <div className="text-[11px] text-muted-foreground mt-1">
                  Added {new Date(it.created_at).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                title="Remove"
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}