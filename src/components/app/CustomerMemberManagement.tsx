import { ClientOnly, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CUSTOMER_LIST_CHANGED, subscribeCustomerListRefresh } from "@/lib/customer-list-refresh";
import {
  ShieldCheck,
  Search,
  Loader2,
  Plus,
  Trash2,
  Users,
  Tags,
  MapPin,
  X,
  RefreshCw,
  Pencil,
  Check,
  KeyRound,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { locationAccuracyLabel } from "@/lib/location-accuracy";
import { toast } from "sonner";
import { isRolesUnlocked } from "@/lib/roles-unlock";
import { RolesGate } from "@/components/app/RolesGate";
import { MemberSecurityActions, AddUserButton } from "@/components/app/MemberSecurityActions";
import { MemberScreenShareButton } from "@/components/app/MemberScreenShareButton";
import { RemoteSession, type Live } from "@/components/tv/TvRemote";
import { deleteMember, listMemberEmails, updateMemberEmail, updateMemberUsername } from "@/lib/admin-users.functions";
import {
  getUserLocationHistory,
  type LocationHistoryRow,
} from "@/lib/user-location-history.functions";
const LocationHistoryMap = lazy(() => import("@/components/app/LocationHistoryMap").then((m) => ({ default: m.LocationHistoryMap })));

interface RoleDef {
  name: string;
  label: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

function displayRoleLabel(name: string, label: string) {
  if (name === "admin") return "Owner";
  return label;
}

interface CredLite {
  id: string;
  app_login_name: string;
}

interface Row {
  id: string;
  username: string | null;
  display_name: string | null;
  roles: string[];
  last_ip: string | null;
  email: string | null;
  creds: CredLite[];
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

type MemberSlots = {
  toolbar: ReactNode;
  details: (userId: string) => ReactNode;
  editor: (userId: string) => ReactNode;
  extras: (userId: string) => ReactNode;
  header: (userId: string) => ReactNode;
  rolesRow: (userId: string) => ReactNode;
};

export function CustomerMemberManagement({ children }: { children: (slots: MemberSlots) => ReactNode }) {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [rolesUnlocked, setRolesUnlocked] = useState(false);
  useEffect(() => {
    setRolesUnlocked(isRolesUnlocked(user?.id));
  }, [user?.id]);
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [rows, setRows] = useState<Row[]>([]);
  const [roleDefs, setRoleDefs] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const deleteMemberFn = useServerFn(deleteMember);
  const listEmailsFn = useServerFn(listMemberEmails);
  const updateUsernameFn = useServerFn(updateMemberUsername);
  const updateEmailFn = useServerFn(updateMemberEmail);
  const [editingUsernameFor, setEditingUsernameFor] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [addRolesFor, setAddRolesFor] = useState<string | null>(null);
  const [share, setShare] = useState<{ live: Live; name: string } | null>(null);
  

  const loadAll = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [{ data: profs }, { data: rolesData }, { data: defs }, { data: ipsData }, emailsRes, { data: credsData }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name")
          .order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("role_definitions")
          .select("name, label, is_system, is_active, sort_order")
          .order("sort_order"),
        supabase.from("signup_info").select("user_id, ip"),
        listEmailsFn({} as never).catch((e) => {
          console.warn("[admin-roles] email fetch failed", e);
          return { emails: {} as Record<string, string> };
        }),
        supabase
          .from("app_credentials")
          .select("id, owner_id, app_login_name")
          .order("created_at", { ascending: false }),
      ]);
    const roleMap = new Map<string, string[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(String(r.role));
      roleMap.set(r.user_id, arr);
    });
    const ipMap = new Map<string, string | null>();
    (ipsData ?? []).forEach((r: any) => {
      ipMap.set(r.user_id, (r.ip as string | null) ?? null);
    });
    const emailMap = (emailsRes as { emails: Record<string, string> }).emails ?? {};
    const credMap = new Map<string, CredLite[]>();
    (credsData ?? []).forEach((c: any) => {
      const arr = credMap.get(c.owner_id) ?? [];
      arr.push({ id: c.id, app_login_name: c.app_login_name });
      credMap.set(c.owner_id, arr);
    });
    setRows(
      (profs ?? []).map((p: any) => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        roles: roleMap.get(p.id) ?? [],
        last_ip: ipMap.get(p.id) ?? null,
        email: emailMap[p.id] ?? null,
        creds: credMap.get(p.id) ?? [],
      })),
    );
    setRoleDefs((defs ?? []) as RoleDef[]);
    setLoading(false);
  };
  const refreshRef = useRef(loadAll);
  refreshRef.current = loadAll;
  useEffect(() => {
    if (!isAdmin) return;
    return subscribeCustomerListRefresh(() => { void refreshRef.current(true); });
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin]);

  // Live role updates: any grant/revoke (manual or from subscription sync)
  // repaints the role chips without a refresh.
  useEffect(() => {
    if (!isAdmin) return;
    const refreshRoleChips = async () => {
      const { data } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, string[]>();
      (data ?? []).forEach((r: any) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(String(r.role));
        roleMap.set(r.user_id, arr);
      });
      setRows((prev) => prev.map((r) => ({ ...r, roles: roleMap.get(r.id) ?? [] })));
    };
    const channel = supabase
      .channel("admin-roles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        void refreshRoleChips();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin]);


  const activeRoles = useMemo(() => roleDefs.filter((r) => r.is_active), [roleDefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter === "none" && r.roles.length > 0) return false;
      if (roleFilter !== "all" && roleFilter !== "none" && !r.roles.includes(roleFilter))
        return false;
      if (!q) return true;
      return (
        (r.username ?? "").toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.last_ip ?? "").toLowerCase().includes(q) ||
        r.creds.some((c) => c.app_login_name.toLowerCase().includes(q))
      );
    });
  }, [rows, query, roleFilter]);

  const toggleRole = async (row: Row, role: string) => {
    if (row.id === user?.id && role === "admin" && row.roles.includes("admin")) {
      toast.error("You can't remove your own owner role.");
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
          .eq("role", role as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: row.id, role: role as any });
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

  const styleFor = (role: string) => SYSTEM_STYLE[role] ?? CUSTOM_STYLE;

  const saveUsername = async (row: Row) => {
    const next = usernameDraft.trim();
    if (!next || next === row.username) {
      setEditingUsernameFor(null);
      return;
    }
    setSavingUsername(true);
    try {
      await updateUsernameFn({ data: { userId: row.id, username: next } });
      setRows((all) => all.map((r) => (r.id === row.id ? { ...r, username: next } : r)));
      toast.success(`Username changed to @${next}`);
      window.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED));
      setEditingUsernameFor(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update username");
    } finally {
      setSavingUsername(false);
    }
  };

  const saveEmail = async (row: Row) => {
    const next = emailDraft.trim().toLowerCase();
    if (!next || next === row.email) {
      setEditingEmailFor(null);
      return;
    }
    setSavingEmail(true);
    try {
      await updateEmailFn({ data: { userId: row.id, email: next } });
      setRows((all) => all.map((r) => (r.id === row.id ? { ...r, email: next } : r)));
      toast.success(`Email changed to ${next}`);
      setEditingEmailFor(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update email");
    } finally {
      setSavingEmail(false);
    }
  };

  const removeMember = async (row: Row) => {
    if (row.id === user?.id) {
      toast.error("You can't delete your own account.");
      return;
    }
    const name = row.display_name || row.username || row.id.slice(0, 8);
    if (
      !confirm(
        `Permanently delete ${name}? This removes their account and all associated data and cannot be undone.`,
      )
    )
      return;
    setDeletingUser(row.id);
    try {
      await deleteMemberFn({ data: { userId: row.id } });
      setRows((all) => all.filter((r) => r.id !== row.id));
      toast.success(`${name} deleted`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete member");
    } finally {
      setDeletingUser(null);
    }
  };

  if (!isAdmin) return <Navigate to="/home" />;
  if (!rolesUnlocked) {
    return <RolesGate onUnlocked={() => setRolesUnlocked(true)} />;
  }

  if (share) return <section className="min-w-0 w-full space-y-4">
    <h2 className="text-xl font-bold">Screen share with {share.name}</h2>
    <RemoteSession key={share.live.id} live={share.live} onEnd={() => setShare(null)} />
  </section>;

  const memberExtras = (userId: string) => {
    const row = rows.find((r) => r.id === userId);
    if (!row) return null;
    return <div className="flex flex-wrap items-baseline gap-x-1.5 break-all text-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Email:</span><span>{row.email || "—"}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last IP:</span><span>{row.last_ip || "—"}</span>
    </div>;
  };
  const banMember = async (row: Row) => {
    if (row.id === user?.id) {
      toast.error("You can't ban your own account.");
      return;
    }
    const name = row.display_name || row.username || row.id.slice(0, 8);
    const banned = row.roles.includes("banned");
    if (!confirm(banned ? `Lift the ban on ${name}?` : `Ban ${name}? They will lose access to the site immediately.`)) return;
    await toggleRole(row, "banned");
  };
  const memberHeader = (userId: string) => {
    const row = rows.find((r) => r.id === userId);
    if (!row) return null;
    const banned = row.roles.includes("banned");
    return <>
      <MemberScreenShareButton name={row.username || row.display_name || "Member"} disabled={share !== null}
        onPaired={(live, name) => setShare({ live, name })} />
      <Button variant="ghost" size="icon" className="size-6" title="View location history" aria-label={`View location history for ${row.username || row.display_name}`} onClick={() => setHistoryFor(row)}><MapPin className="size-4" /></Button>
      <Button variant="ghost" size="icon" className={cn("size-6", banned && "text-destructive")} title={banned ? "Lift ban" : "Ban user"} aria-label={`${banned ? "Lift ban on" : "Ban"} ${row.username || row.display_name}`} disabled={saving !== null || row.id === user?.id} onClick={() => void banMember(row)}><Ban className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="size-6 hover:text-destructive" title="Delete member" aria-label={`Delete member ${row.username || row.display_name}`} disabled={deletingUser === row.id || row.id === user?.id} onClick={() => void removeMember(row)}>{deletingUser === row.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>
    </>;
  };
  const memberRoles = (userId: string) => {
    const row = rows.find((r) => r.id === userId);
    if (!row) return null;
    return <div className="flex flex-wrap items-center gap-2">
      {row.roles.map((rn) => {
        const rd = roleDefs.find((r) => r.name === rn);
        const label = rd ? displayRoleLabel(rd.name, rd.label) : rn;
        return <span key={rn} className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold", styleFor(rn))}>{label}<Button variant="ghost" size="icon" className="size-4" title={`Remove ${label}`} aria-label={`Remove ${label} from ${row.username || row.display_name}`} disabled={saving !== null} onClick={() => void toggleRole(row, rn)}><X className="size-3" /></Button></span>;
      })}
      <Button variant="outline" size="icon" className="size-6 border-dashed" title="Add role" aria-label={`Add role for ${row.username || row.display_name}`} onClick={() => setAddRolesFor(row.id)}><Plus className="size-3.5" /></Button>
    </div>;
  };
  const memberDetails = (userId: string) => {
    const row = rows.find((r) => r.id === userId);
    if (!row) return null;
    return <div className="space-y-3 border-t border-border pt-3">
      <MemberSecurityActions userId={row.id} name={row.display_name ?? row.username ?? "this user"} />
    </div>;
  };
  const memberEditor = (userId: string) => {
    const row = rows.find((r) => r.id === userId);
    if (!row || !isAdmin) return null;
    return <section className="space-y-2 border-b border-border pb-4">
      <label className="block space-y-1 text-sm">Site username<Input aria-label="Site username" value={editingUsernameFor === row.id ? usernameDraft : row.username ?? ""} onChange={(e) => { setEditingUsernameFor(row.id); setUsernameDraft(e.target.value); }} /></label>
      <Button size="sm" disabled={savingUsername || editingUsernameFor !== row.id || !usernameDraft.trim()} onClick={() => void saveUsername(row)}>Save username</Button>
      <label className="block space-y-1 text-sm">Email<Input type="email" aria-label="Email" value={editingEmailFor === row.id ? emailDraft : row.email ?? ""} onChange={(e) => { setEditingEmailFor(row.id); setEmailDraft(e.target.value); }} /></label>
      <Button size="sm" disabled={savingEmail || editingEmailFor !== row.id || !emailDraft.trim()} onClick={() => void saveEmail(row)}>Save email</Button>
    </section>;
  };
  const addRoleRow = rows.find((r) => r.id === addRolesFor);
  return <>
    {children({ toolbar: <><AddUserButton onCreated={() => window.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED))} /><Button variant="outline" size="sm" onClick={() => setTab("roles")}><Tags className="size-4" />Manage roles</Button></>, details: memberDetails, editor: memberEditor, extras: memberExtras, header: memberHeader, rolesRow: memberRoles })}
    <Dialog open={tab === "roles"} onOpenChange={(open) => { if (!open) setTab("members"); }}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Manage roles</DialogTitle></DialogHeader><RolesManager defs={roleDefs} onChange={() => void loadAll()} /></DialogContent></Dialog>
    <Dialog open={!!addRoleRow} onOpenChange={(open) => { if (!open) setAddRolesFor(null); }}><DialogContent><DialogHeader><DialogTitle>Add role · {addRoleRow?.username || addRoleRow?.display_name}</DialogTitle></DialogHeader><div className="flex flex-wrap gap-2">{addRoleRow && activeRoles.filter((rd) => !addRoleRow.roles.includes(rd.name)).map((rd) => <Button key={rd.name} variant="outline" size="sm" disabled={saving !== null} onClick={() => void toggleRole(addRoleRow, rd.name)}>{displayRoleLabel(rd.name, rd.label)}</Button>)}</div></DialogContent></Dialog>
    {historyFor && <LocationHistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />}
  </>;
}

function LocationHistoryDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const fetchHistory = useServerFn(getUserLocationHistory);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LocationHistoryRow[]>([]);
  const [view, setView] = useState<"table" | "map">("map");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const load = (showLoader: boolean) => {
      if (showLoader) setLoading(true);
      fetchHistory({ data: { userId: row.id, limit: 100 } })
        .then((res) => {
          if (active) setRows(res.rows);
        })
        .catch((e: Error) => {
          if (showLoader) toast.error(e.message ?? "Failed to load history");
          else console.warn("[location-history] refresh failed", e);
        })
        .finally(() => {
          if (active && showLoader) setLoading(false);
        });
    };

    setLoading(true);
    load(true);
    const interval = window.setInterval(() => load(false), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [row.id, fetchHistory, refreshTick]);

  const fmtLoc = (r: LocationHistoryRow) => {
    const named = [r.city, r.region, r.country].filter(Boolean).join(", ");
    if (named) {
      const accuracyLabel = locationAccuracyLabel(r);
      return accuracyLabel ? `${named} · ${accuracyLabel}` : named;
    }
    const latitudeRaw = r.latitude as unknown;
    const longitudeRaw = r.longitude as unknown;
    const latitude = latitudeRaw == null || latitudeRaw === "" ? null : Number(latitudeRaw);
    const longitude = longitudeRaw == null || longitudeRaw === "" ? null : Number(longitudeRaw);
    if (
      latitude != null &&
      longitude != null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      const accuracyValue = Number(r.accuracy_m);
      const accuracy = Number.isFinite(accuracyValue) ? ` · ±${Math.round(accuracyValue)}m` : "";
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy}`;
    }
    return "—";
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[85vh] bg-surface-1 border border-border rounded-2xl shadow-elegant overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-display font-bold truncate">Location history</h2>
            <p className="text-xs text-muted-foreground truncate">
              {row.display_name || row.username || row.id} · @{row.username ?? row.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["map", "table"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 capitalize",
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRefreshTick((tick) => tick + 1)}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-surface-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className={cn("flex-1 min-h-0 overflow-hidden", view === "table" && "overflow-auto")}>
          {loading ? (
            <div className="grid place-items-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-muted-foreground text-sm">
              No location events recorded yet. They'll appear here next time this user signs in.
            </div>
          ) : view === "map" ? (
            <ClientOnly><Suspense fallback={<Loader2 className="size-5 animate-spin" />}><LocationHistoryMap rows={rows} /></Suspense></ClientOnly>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-surface-2 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">When</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Event</th>
                  <th className="text-left px-4 py-2.5 font-semibold">IP</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Location</th>
                  <th className="text-left px-4 py-2.5 font-semibold">VPN</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Provider / ISP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{r.event_type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.ip ?? "—"}</td>
                    <td className="px-4 py-2.5">{fmtLoc(r)}</td>
                    <td className="px-4 py-2.5">
                      {r.is_vpn ? (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-destructive/15 text-destructive border border-destructive/30">
                          VPN
                        </span>
                      ) : r.is_proxy ? (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30">
                          Proxy
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-muted-foreground truncate max-w-[220px]"
                      title={r.vpn_provider ?? r.isp ?? ""}
                    >
                      {r.vpn_provider ?? r.isp ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
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
      const { error } = await supabase.rpc("create_app_role", {
        _name: name.trim(),
        _label: label.trim() || name.trim(),
      });
      if (error) throw error;
      toast.success("Role created");
      setName("");
      setLabel("");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create role");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: string) => {
    if (!confirm(`Delete role "${n}"? All members assigned will lose it.`)) return;
    setDeleting(n);
    try {
      const { error } = await supabase.rpc("delete_app_role", { _name: n });
      if (error) throw error;
      toast.success("Role deleted");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete role");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface-1 p-5">
        <h3 className="font-display font-bold mb-1">Add a new role</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Role key is lowercase letters, numbers and underscores. Once created, it can be assigned
          to members on the Members tab.
        </p>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="role key (e.g. support_lead)"
            className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Display label (e.g. Support Lead)"
            className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm"
          />
          <button
            onClick={create}
            disabled={busy}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          <div>Label</div>
          <div>Key</div>
          <div>Type</div>
          <div></div>
        </div>
        {defs.length === 0 && (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">No roles yet.</div>
        )}
        {defs.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-border last:border-0 items-center text-sm"
          >
            <div className="font-medium">{displayRoleLabel(r.name, r.label)}</div>
            <code className="text-xs text-muted-foreground">{r.name}</code>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-md border",
                r.is_system
                  ? "border-border text-muted-foreground"
                  : "border-primary/40 text-primary",
                !r.is_active && "opacity-50",
              )}
            >
              {r.is_system ? "System" : r.is_active ? "Custom" : "Deleted"}
            </span>
            <button
              onClick={() => remove(r.name)}
              disabled={r.is_system || !r.is_active || deleting === r.name}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              {deleting === r.name ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
