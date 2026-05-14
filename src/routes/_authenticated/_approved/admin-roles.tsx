import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Search, Loader2, Plus, Trash2, Users, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-roles")({
  component: AdminRolesPage,
});

interface RoleDef {
  name: string;
  label: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

interface Row {
  id: string;
  username: string | null;
  display_name: string | null;
  roles: string[];
}

const SYSTEM_STYLE: Record<string, string> = {
  admin: "bg-primary text-primary-foreground border-primary shadow-glow",
  management: "bg-accent text-accent-foreground border-accent",
  moderator: "bg-secondary text-secondary-foreground border-secondary",
  staff: "bg-surface-2 text-foreground border-border",
  member: "bg-surface-2 text-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
  banned: "bg-destructive text-destructive-foreground border-destructive",
};
const CUSTOM_STYLE = "bg-primary/20 text-primary border-primary/40";

function AdminRolesPage() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [rows, setRows] = useState<Row[]>([]);
  const [roleDefs, setRoleDefs] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: profs }, { data: rolesData }, { data: defs }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("role_definitions").select("name, label, is_system, is_active, sort_order").order("sort_order"),
    ]);
    const roleMap = new Map<string, string[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(String(r.role));
      roleMap.set(r.user_id, arr);
    });
    setRows((profs ?? []).map((p: any) => ({
      id: p.id, username: p.username, display_name: p.display_name, roles: roleMap.get(p.id) ?? [],
    })));
    setRoleDefs((defs ?? []) as RoleDef[]);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  const activeRoles = useMemo(() => roleDefs.filter((r) => r.is_active), [roleDefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.username ?? "").toLowerCase().includes(q) ||
      (r.display_name ?? "").toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const toggleRole = async (row: Row, role: string) => {
    if (row.id === user?.id && role === "admin" && row.roles.includes("admin")) {
      toast.error("You can't remove your own admin role.");
      return;
    }
    const has = row.roles.includes(role);
    setSaving(`${row.id}:${role}`);
    try {
      if (has) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", row.id).eq("role", role as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: row.id, role: role as any });
        if (error) throw error;
      }
      setRows((all) => all.map((r) => r.id === row.id
        ? { ...r, roles: has ? r.roles.filter((x) => x !== role) : [...r.roles, role] }
        : r));
      toast.success(has ? `Removed ${role}` : `Granted ${role}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update role");
    } finally { setSaving(null); }
  };

  const styleFor = (role: string) => SYSTEM_STYLE[role] ?? CUSTOM_STYLE;

  if (!isAdmin) return <Navigate to="/home" />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <ShieldCheck className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Members & Roles</h1>
            <p className="text-sm text-muted-foreground">Assign roles to members or manage the role list.</p>
          </div>
        </header>

        <div className="flex gap-2 mb-5 border-b border-border">
          {([["members","Members",Users],["roles","Manage roles",Tags]] as const).map(([k, lbl, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" /> {lbl}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : tab === "members" ? (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, username, or user id…"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
            </div>
            <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
              <div className="grid grid-cols-[1fr_2fr] gap-4 px-5 py-3 border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                <div>User</div><div>Roles</div>
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
                    {activeRoles.map((rd) => {
                      const active = row.roles.includes(rd.name);
                      const busy = saving === `${row.id}:${rd.name}`;
                      return (
                        <button key={rd.name} onClick={() => toggleRole(row, rd.name)} disabled={busy}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize",
                            active ? styleFor(rd.name) : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground",
                            busy && "opacity-60 cursor-wait")}>
                          {busy ? "…" : rd.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <RolesManager defs={roleDefs} onChange={loadAll} />
        )}
      </div>
    </main>
  );
}

function RolesManager({ defs, onChange }: { defs: RoleDef[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return toast.error("Enter a role key");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_app_role", { _name: name.trim(), _label: label.trim() || name.trim() });
      if (error) throw error;
      toast.success("Role created");
      setName(""); setLabel("");
      onChange();
    } catch (e: any) { toast.error(e.message ?? "Failed to create role"); }
    finally { setBusy(false); }
  };

  const remove = async (n: string) => {
    if (!confirm(`Delete role "${n}"? All members assigned will lose it.`)) return;
    setDeleting(n);
    try {
      const { error } = await supabase.rpc("delete_app_role", { _name: n });
      if (error) throw error;
      toast.success("Role deleted");
      onChange();
    } catch (e: any) { toast.error(e.message ?? "Failed to delete role"); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface-1 p-5">
        <h3 className="font-display font-bold mb-1">Add a new role</h3>
        <p className="text-xs text-muted-foreground mb-4">Role key is lowercase letters, numbers and underscores. Once created, it can be assigned to members on the Members tab.</p>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="role key (e.g. support_lead)"
            className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label (e.g. Support Lead)"
            className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <button onClick={create} disabled={busy}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          <div>Label</div><div>Key</div><div>Type</div><div></div>
        </div>
        {defs.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground text-sm">No roles yet.</div>}
        {defs.map((r) => (
          <div key={r.name} className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-border last:border-0 items-center text-sm">
            <div className="font-medium">{r.label}</div>
            <code className="text-xs text-muted-foreground">{r.name}</code>
            <span className={cn("text-xs px-2 py-0.5 rounded-md border",
              r.is_system ? "border-border text-muted-foreground" : "border-primary/40 text-primary",
              !r.is_active && "opacity-50")}>
              {r.is_system ? "System" : r.is_active ? "Custom" : "Deleted"}
            </span>
            <button onClick={() => remove(r.name)} disabled={r.is_system || !r.is_active || deleting === r.name}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground">
              {deleting === r.name ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
