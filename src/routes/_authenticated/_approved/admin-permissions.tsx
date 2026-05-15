import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Shield, Layers, Hash, ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface PermsSearch { tab?: "pages" | "channels"; channel?: string; group?: string }

export const Route = createFileRoute("/_authenticated/_approved/admin-permissions")({
  validateSearch: (search: Record<string, unknown>): PermsSearch => ({
    tab: search.tab === "channels" ? "channels" : search.tab === "pages" ? "pages" : undefined,
    channel: typeof search.channel === "string" ? search.channel : undefined,
    group: typeof search.group === "string" ? search.group : undefined,
  }),
  component: AdminPermissionsPage,
});

interface RoleDef { name: string; label: string; is_system: boolean; is_active: boolean; sort_order: number; }
interface PagePerm { page_key: string; label: string; allowed_roles: string[]; sort_order: number; }
interface Channel { id: string; name: string; slug: string; staff_only: boolean; sort_order: number; group_label: string; }
interface ChanPerm { channel_id: string; role: string; can_view: boolean; can_send: boolean; can_delete: boolean; can_mention: boolean; }

const LOCKED = new Set(["admin", "management"]);
const HIDDEN_ROLES = new Set(["pending", "banned"]);

// Auto-discover all page routes under /_authenticated/_approved at build time.
// New page files added by future code automatically show up here.
const APPROVED_ROUTE_FILES = import.meta.glob("/src/routes/_authenticated/_approved/*.tsx");
const DISCOVERED_PAGE_KEYS: string[] = Object.keys(APPROVED_ROUTE_FILES)
  .map((p) => p.split("/").pop()!.replace(/\.tsx$/, ""))
  // Skip layouts (no dot), dynamic ($), index splits (home.index), and the perms page itself.
  .filter((n) => !n.startsWith("_") && !n.includes("$") && !n.includes("."));

function humanLabel(key: string): string {
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AdminPermissionsPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const search = Route.useSearch();
  const [tab, setTab] = useState<"pages" | "channels">(search.tab ?? "pages");
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [pages, setPages] = useState<PagePerm[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [chanPerms, setChanPerms] = useState<ChanPerm[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    const [r, p, c, cp] = await Promise.all([
      supabase.from("role_definitions").select("name,label,is_system,is_active,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("page_permissions").select("page_key,label,allowed_roles,sort_order").order("sort_order"),
      supabase.from("chat_channels").select("id,name,slug,staff_only,sort_order,group_label").order("sort_order"),
      supabase.from("channel_permissions").select("channel_id,role,can_view,can_send,can_delete,can_mention"),
    ]);
    // Auto-register any page routes that exist in the app but are missing from page_permissions.
    const existing = new Set((p.data ?? []).map((x: PagePerm) => x.page_key));
    const missing = DISCOVERED_PAGE_KEYS.filter((k) => !existing.has(k));
    if (missing.length > 0) {
      const maxSort = (p.data ?? []).reduce((m: number, x: PagePerm) => Math.max(m, x.sort_order ?? 0), 0);
      const rows = missing.map((key, i) => ({
        page_key: key,
        label: humanLabel(key),
        allowed_roles: [] as string[],
        sort_order: maxSort + 10 * (i + 1),
      }));
      const { error: insErr, data: ins } = await supabase
        .from("page_permissions")
        .insert(rows as any)
        .select("page_key,label,allowed_roles,sort_order");
      if (!insErr && ins) {
        setPages([...(p.data ?? []), ...ins].sort((a, b) => a.sort_order - b.sort_order));
      } else {
        setPages(p.data ?? []);
      }
    } else {
      setPages(p.data ?? []);
    }
    setRoles((r.data ?? []).filter((x: RoleDef) => !HIDDEN_ROLES.has(x.name)));
    setChannels(c.data ?? []);
    setChanPerms(cp.data ?? []);
    setLoading(false);
    setRefreshing(false);
    setLastRefresh(new Date());
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (search.tab) setTab(search.tab); }, [search.tab]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-perms-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "page_permissions" }, () => load({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_permissions" }, () => load({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channels" }, () => load({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "role_definitions" }, () => load({ silent: true }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!isAdmin) return <Navigate to="/home" />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to admin dashboard
        </Link>
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Role permissions</h1>
            <p className="text-sm text-muted-foreground">Control which roles can access pages and what they can do in channels. Admin and management always bypass these checks.</p>
          </div>
          <button
            onClick={() => load({ silent: true })}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-2/70 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            title="Reload pages, channels and permissions"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="flex flex-col items-start leading-tight">
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
              {lastRefresh && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </span>
          </button>
        </header>

        <div className="flex gap-2 mb-4">
          <TabBtn active={tab === "pages"} onClick={() => setTab("pages")} icon={Layers}>Pages</TabBtn>
          <TabBtn active={tab === "channels"} onClick={() => setTab("channels")} icon={Hash}>Channels</TabBtn>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : tab === "pages" ? (
          <PagesTab pages={pages} roles={roles} onChanged={load} />
        ) : (
          <ChannelsTab channels={channels} roles={roles} chanPerms={chanPerms} onChanged={load} initialChannelId={search.channel} groupFilter={search.group} />
        )}
      </div>
    </main>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ${active ? "bg-primary text-primary-foreground border-primary shadow-glow" : "bg-surface-2 border-border hover:border-primary/60"}`}>
      <Icon className="size-4" /> {children}
    </button>
  );
}

function PagesTab({ pages, roles, onChanged }: { pages: PagePerm[]; roles: RoleDef[]; onChanged: () => void }) {
  const toggle = async (page: PagePerm, role: string) => {
    if (LOCKED.has(role)) return;
    const has = page.allowed_roles.includes(role);
    const next = has ? page.allowed_roles.filter((r) => r !== role) : [...page.allowed_roles, role];
    const { error } = await supabase.from("page_permissions").update({ allowed_roles: next as any }).eq("page_key", page.page_key);
    if (error) toast.error(error.message); else onChanged();
  };
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 sticky left-0 bg-surface-2">Page</th>
              {roles.map((r) => (
                <th key={r.name} className="px-3 py-3 text-center min-w-[88px]">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.page_key} className="border-t border-border">
                <td className="px-4 py-3 font-medium sticky left-0 bg-surface-1">{p.label}<div className="text-[10px] text-muted-foreground font-normal">/{p.page_key}</div></td>
                {roles.map((r) => {
                  const on = LOCKED.has(r.name) || p.allowed_roles.includes(r.name);
                  const locked = LOCKED.has(r.name);
                  return (
                    <td key={r.name} className="px-3 py-3 text-center">
                      <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(p, r.name)} className="size-4 accent-primary disabled:opacity-50" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelsTab({ channels, roles, chanPerms, onChanged, initialChannelId, groupFilter }: { channels: Channel[]; roles: RoleDef[]; chanPerms: ChanPerm[]; onChanged: () => void; initialChannelId?: string; groupFilter?: string }) {
  const visible = groupFilter ? channels.filter((c) => c.group_label === groupFilter) : channels;
  const [active, setActive] = useState(initialChannelId ?? visible[0]?.id ?? "");
  useEffect(() => { if (initialChannelId) setActive(initialChannelId); }, [initialChannelId]);
  useEffect(() => { if (!active && visible[0]) setActive(visible[0].id); }, [visible, active]);
  const channel = channels.find((c) => c.id === active);
  const permFor = (role: string): ChanPerm => chanPerms.find((cp) => cp.channel_id === active && cp.role === role) ?? { channel_id: active, role, can_view: false, can_send: false, can_delete: false, can_mention: false };

  const toggle = async (role: string, key: "can_view" | "can_send" | "can_delete" | "can_mention") => {
    if (LOCKED.has(role)) return;
    const cur = permFor(role);
    const next = { ...cur, [key]: !cur[key] };
    const { error } = await supabase.from("channel_permissions").upsert(next as any, { onConflict: "channel_id,role" });
    if (error) toast.error(error.message); else onChanged();
  };

  if (visible.length === 0) return <div className="text-sm text-muted-foreground">No channels yet.</div>;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-3 rounded-2xl border border-border bg-surface-1 p-2 max-h-[60vh] overflow-y-auto">
        {groupFilter && (
          <div className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Category: {groupFilter}</div>
        )}
        {visible.map((c) => (
          <button key={c.id} onClick={() => setActive(c.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${active === c.id ? "bg-primary text-primary-foreground" : "hover:bg-surface-2"}`}>
            <Hash className="size-4 opacity-70" />
            <span className="truncate">{c.name}</span>
            {c.staff_only && <span className="ml-auto text-[9px] uppercase px-1 rounded bg-amber-500/20 text-amber-400">staff</span>}
          </button>
        ))}
      </div>
      <div className="col-span-12 md:col-span-9 rounded-2xl border border-border bg-surface-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Hash className="size-4 text-muted-foreground" />
          <h3 className="font-display font-semibold">{channel?.name}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Role</th>
                <th className="px-3 py-3 text-center">View</th>
                <th className="px-3 py-3 text-center">Send</th>
                <th className="px-3 py-3 text-center">Delete others</th>
                <th className="px-3 py-3 text-center">@all / @here</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const cp = permFor(r.name);
                const locked = LOCKED.has(r.name);
                const Cell = ({ k }: { k: "can_view" | "can_send" | "can_delete" | "can_mention" }) => (
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={locked || cp[k]} disabled={locked} onChange={() => toggle(r.name, k)} className="size-4 accent-primary disabled:opacity-50" />
                  </td>
                );
                return (
                  <tr key={r.name} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{r.label}{locked && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">always</span>}</td>
                    <Cell k="can_view" />
                    <Cell k="can_send" />
                    <Cell k="can_delete" />
                    <Cell k="can_mention" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}