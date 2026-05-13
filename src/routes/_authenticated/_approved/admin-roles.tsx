import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-roles")({
  component: AdminRolesPage,
});

const ALL_ROLES: AppRole[] = ["admin", "management", "moderator", "staff", "member", "pending"];

const ROLE_STYLES: Record<AppRole, string> = {
  admin: "bg-primary text-primary-foreground border-primary shadow-glow",
  management: "bg-accent text-accent-foreground border-accent",
  moderator: "bg-secondary text-secondary-foreground border-secondary",
  staff: "bg-surface-2 text-foreground border-border",
  member: "bg-surface-2 text-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
};

interface Row {
  id: string;
  username: string | null;
  display_name: string | null;
  roles: AppRole[];
}

function AdminRolesPage() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: rolesData }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (!active) return;
      const roleMap = new Map<string, AppRole[]>();
      (rolesData ?? []).forEach((r) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        roleMap.set(r.user_id, arr);
      });
      setRows(
        (profs ?? []).map((p) => ({
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          roles: roleMap.get(p.id) ?? [],
        })),
      );
      setLoading(false);
    })();
    return () => { active = false; };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.username ?? "").toLowerCase().includes(q) ||
      (r.display_name ?? "").toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const toggleRole = async (row: Row, role: AppRole) => {
    if (row.id === user?.id && role === "admin" && row.roles.includes("admin")) {
      toast.error("You can't remove your own admin role.");
      return;
    }
    const has = row.roles.includes(role);
    setSaving(`${row.id}:${role}`);
    try {
      if (has) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", row.id)
          .eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: row.id, role });
        if (error) throw error;
      }
      setRows((all) =>
        all.map((r) =>
          r.id === row.id
            ? { ...r, roles: has ? r.roles.filter((x) => x !== role) : [...r.roles, role] }
            : r,
        ),
      );
      toast.success(has ? `Removed ${role}` : `Granted ${role}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update role");
    } finally {
      setSaving(null);
    }
  };

  if (!isAdmin) return <Navigate to="/home" />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <ShieldCheck className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">User Roles</h1>
            <p className="text-sm text-muted-foreground">Grant or revoke permissions for any member.</p>
          </div>
        </header>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, or user id…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
            <div className="grid grid-cols-[1fr_2fr] gap-4 px-5 py-3 border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              <div>User</div>
              <div>Roles</div>
            </div>
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-muted-foreground text-sm">No users found.</div>
            )}
            {filtered.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_2fr] gap-4 px-5 py-4 border-b border-border last:border-0 items-center">
                <div className="min-w-0">
                  <div className="font-medium truncate">{row.display_name || row.username || "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground truncate">@{row.username ?? row.id.slice(0, 8)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((role) => {
                    const active = row.roles.includes(role);
                    const busy = saving === `${row.id}:${role}`;
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(row, role)}
                        disabled={busy}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize",
                          active
                            ? ROLE_STYLES[role]
                            : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground",
                          busy && "opacity-60 cursor-wait",
                        )}
                      >
                        {busy ? "…" : role}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}