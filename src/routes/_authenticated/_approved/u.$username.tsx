import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pencil, Camera, Loader2, ShieldCheck, Clock as ClockIcon,
  Coffee, UtensilsCrossed, Ticket, ShoppingBag, Eye, EyeOff,
  Lock, KeyRound, Copy, Check, Globe, Calendar, StickyNote, AtSign,
  Trophy, Gift, X as XIcon, UserPlus, Plus, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import profileHeader from "@/assets/profile-header.jpg";
import tvLoginIllustration from "@/assets/tv-login-illustration.jpg";
import referralsBg from "@/assets/referrals-bg.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { listTimeZones } from "@/hooks/use-user-timezone";

export const Route = createFileRoute("/_authenticated/_approved/u/$username")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? (search.tab as string) : undefined,
    edit: search.edit ? 1 : undefined,
  }),
  component: ProfilePage,
});

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  is_private: boolean | null;
  timezone: string | null;
}

interface ShiftRow { id: string; user_id: string; clock_in: string; clock_out: string | null; }
interface BreakRow { id: string; user_id: string; kind: "break" | "lunch"; started_at: string; ended_at: string | null; }
interface CredRow { id: string; app_login_name: string; password: string; expiry_at: string | null; notes: string | null; }
interface DnsRow { id: string; label: string; code: string; notes: string | null; }
interface TicketRow { id: string; subject: string; status: string; created_at: string; }
interface OrderRow { id: string; total_cents: number; status: string; created_at: string; }
interface InviteSummary {
  sent: number;
  used: number;
  bonusPaid: number;
  invitedBy: { username: string | null; display_name: string | null } | null;
  invitedAt: string | null;
  invitedBonusPaid: boolean;
}

interface ReferralRow {
  id: string;
  code: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
  referral_bonus_paid: boolean;
  joined_name: string | null;
  joined_username: string | null;
}

interface FriendRow {
  friendship_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

type FriendRel =
  | { kind: "none" }
  | { kind: "self" }
  | { kind: "outgoing"; id: string }
  | { kind: "incoming"; id: string }
  | { kind: "friends"; id: string };

const ROLE_STYLES: Record<AppRole, string> = {
  admin: "bg-destructive/15 text-destructive border-destructive/30",
  management: "bg-primary/15 text-primary border-primary/30",
  moderator: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  staff: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  subscriber: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  member: "bg-surface-2 text-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
  banned: "bg-destructive text-destructive-foreground border-destructive",
  rejected: "bg-rose-600/20 text-rose-300 border-rose-500/40",
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fmt(s: number) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

function ProfilePage() {
  const { username } = Route.useParams();
  const search = Route.useSearch();
  const { user: viewer, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const { format: fmtCurrency } = useCurrency();
  const [now, setNow] = useState(() => Date.now());
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [breakRow, setBreakRow] = useState<BreakRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [inviteInfo, setInviteInfo] = useState<InviteSummary | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [rel, setRel] = useState<FriendRel>({ kind: "none" });
  const [relBusy, setRelBusy] = useState(false);
  const initialTab = (["welcome","profile","creds","tickets","orders","referrals","friends"].includes(search.tab ?? "") ? search.tab : "welcome") as "welcome" | "profile" | "creds" | "tickets" | "orders" | "referrals" | "friends";
  const [mainTab, setMainTab] = useState<"welcome" | "profile" | "creds" | "tickets" | "orders" | "referrals" | "friends">(initialTab);

  const isOwner = !!profile && !!viewer && profile.id === viewer.id;
  const canSeeCreds = isOwner || isAdmin;
  const canSeeReferrals = isOwner || isAdmin;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: p } = await supabase
      .from("profiles").select("*").eq("username", username).maybeSingle();
    if (!p) { setProfile(null); setLoading(false); return; }
    setProfile(p as ProfileRow);

    const [{ data: r }, { data: s }, { data: b }, { data: tk }, { data: od }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", p.id),
      supabase.from("shifts").select("*").eq("user_id", p.id).is("clock_out", null).maybeSingle(),
      supabase.from("breaks").select("*").eq("user_id", p.id).is("ended_at", null).maybeSingle(),
      supabase.from("tickets").select("id, subject, status, created_at").eq("user_id", p.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("orders").select("id, total_cents, status, created_at").eq("user_id", p.id).order("created_at", { ascending: false }).limit(5),
    ]);
    setRoles((r ?? []).map((x: any) => x.role as AppRole));
    setShift((s as ShiftRow) ?? null);
    setBreakRow((b as BreakRow) ?? null);
    setTickets((tk ?? []) as TicketRow[]);
    setOrders((od ?? []) as OrderRow[]);

    // Invite info — visible to the profile owner and admins; for others we only show invitedBy
    const [{ data: sentInv }, { data: invitedRow }] = await Promise.all([
      supabase
        .from("invites")
        .select("id, used_by, referral_bonus_paid")
        .eq("created_by", p.id),
      supabase
        .from("invites")
        .select("created_by, used_at, referral_bonus_paid")
        .eq("used_by", p.id)
        .maybeSingle(),
    ]);
    let invitedBy: InviteSummary["invitedBy"] = null;
    if (invitedRow?.created_by) {
      const { data: prof } = await supabase
        .from("profiles").select("username, display_name").eq("id", invitedRow.created_by).maybeSingle();
      invitedBy = prof ? { username: prof.username, display_name: prof.display_name } : null;
    }
    const sentRows = (sentInv ?? []) as { used_by: string | null; referral_bonus_paid: boolean }[];
    setInviteInfo({
      sent: sentRows.length,
      used: sentRows.filter((x) => x.used_by).length,
      bonusPaid: sentRows.filter((x) => x.referral_bonus_paid).length,
      invitedBy,
      invitedAt: invitedRow?.used_at ?? null,
      invitedBonusPaid: !!invitedRow?.referral_bonus_paid,
    });

    // Full referral list (visible to owner / admin via RLS)
    const { data: refRows } = await supabase
      .from("invites")
      .select("id, code, used_by, used_at, created_at, referral_bonus_paid")
      .eq("created_by", p.id)
      .order("created_at", { ascending: false });
    const baseRows = (refRows ?? []) as Omit<ReferralRow, "joined_name" | "joined_username">[];
    const usedIds = Array.from(new Set(baseRows.map((r) => r.used_by).filter(Boolean) as string[]));
    let usedMap: Record<string, { display_name: string | null; username: string | null }> = {};
    if (usedIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", usedIds);
      usedMap = Object.fromEntries((profs ?? []).map((x) => [x.id, { display_name: x.display_name, username: x.username }]));
    }
    setReferrals(
      baseRows.map((r) => ({
        ...r,
        joined_name: r.used_by ? usedMap[r.used_by]?.display_name ?? null : null,
        joined_username: r.used_by ? usedMap[r.used_by]?.username ?? null : null,
      })),
    );

    // Friends list for the profile owner — one-directional:
    // only people they sent an accepted request to count as their friends.
    const { data: friendRows } = await supabase
      .from("friendships")
      .select("id, addressee_id")
      .eq("status", "accepted")
      .eq("requester_id", p.id);
    const otherIds = (friendRows ?? []).map((f: any) => f.addressee_id);
    let friendProfiles: Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }> = {};
    if (otherIds.length) {
      const { data: fp } = await supabase
        .from("profiles").select("id, username, display_name, avatar_url").in("id", otherIds);
      friendProfiles = Object.fromEntries((fp ?? []).map((x: any) => [x.id, x]));
    }
    setFriends(
      (friendRows ?? []).map((f: any) => {
        const otherId = f.addressee_id;
        const fp = friendProfiles[otherId] ?? { username: null, display_name: null, avatar_url: null };
        return {
          friendship_id: f.id,
          user_id: otherId,
          username: fp.username,
          display_name: fp.display_name,
          avatar_url: fp.avatar_url,
        };
      }),
    );

    // Viewer ↔ profile relationship
    if (viewer && viewer.id !== p.id) {
      const { data: relRow } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(
          `and(requester_id.eq.${viewer.id},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${viewer.id})`,
        )
        .maybeSingle();
      if (!relRow) setRel({ kind: "none" });
      else if (relRow.status === "accepted") {
        // Only the original requester treats this as a "friends" relationship.
        if (relRow.requester_id === viewer.id) setRel({ kind: "friends", id: relRow.id });
        else setRel({ kind: "none" });
      }
      else if (relRow.requester_id === viewer.id) setRel({ kind: "outgoing", id: relRow.id });
      else setRel({ kind: "incoming", id: relRow.id });
    } else {
      setRel({ kind: "self" });
    }

    setLoading(false);
  };

  const createInvite = async () => {
    if (!viewer || !isOwner) return;
    setCreatingInvite(true);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 5; i++) {
      let code = "";
      for (let j = 0; j < 8; j++) code += chars[Math.floor(Math.random() * chars.length)];
      const { error } = await supabase.from("invites").insert({ code, created_by: viewer.id });
      if (!error) {
        toast.success(`Invite code ${code} created`);
        setCreatingInvite(false);
        load();
        return;
      }
      if (!error.message.toLowerCase().includes("unique")) {
        toast.error(error.message);
        setCreatingInvite(false);
        return;
      }
    }
    toast.error("Could not generate a unique code, please try again");
    setCreatingInvite(false);
  };

  const copyInviteLink = async (code: string) => {
    const link = `${window.location.origin}/signup?invite=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      toast.success("Invite link copied");
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const deleteInvite = async (id: string) => {
    if (!confirm("Delete this invite?")) return;
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite deleted");
    load();
  };

  useEffect(() => { load(); }, [username]);

  // Realtime: refresh when any friendship row involving the profile owner
  // or the current viewer changes (e.g. addressee accepts an outgoing request).
  useEffect(() => {
    if (!profile?.id) return;
    const ids = new Set([profile.id, viewer?.id].filter(Boolean) as string[]);
    const ch = supabase
      .channel(`profile-friendships:${profile.id}:${viewer?.id ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        (payload) => {
          const row: any = payload.new ?? payload.old ?? {};
          if (ids.has(row.requester_id) || ids.has(row.addressee_id)) load();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, viewer?.id]);

  const sendFriendRequest = async () => {
    if (!viewer || !profile || rel.kind !== "none") return;
    setRelBusy(true);
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: viewer.id, addressee_id: profile.id });
    setRelBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Friend request sent");
    load();
  };

  const acceptFriendRequest = async () => {
    if (rel.kind !== "incoming") return;
    setRelBusy(true);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", rel.id);
    setRelBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Friend request accepted");
    load();
  };

  const removeFriend = async (friendshipId: string) => {
    if (!confirm("Remove this friend?")) return;
    const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  const sortedRoles = useMemo(() => {
    const order: AppRole[] = ["admin", "management", "moderator", "staff", "member", "pending", "banned"];
    return [...roles].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [roles]);

  if (loading) {
    return (
      <main className="flex-1 grid place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex-1 grid place-items-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Profile not found</h1>
          <p className="text-muted-foreground mb-4">No member with username “{username}”.</p>
          <Link to="/home" className="text-primary underline">Back to home</Link>
        </div>
      </main>
    );
  }

  const display = profile.display_name || profile.username || "Member";
  const onShiftSeconds = shift ? Math.floor((now - new Date(shift.clock_in).getTime()) / 1000) : 0;
  const onBreakSeconds = breakRow ? Math.floor((now - new Date(breakRow.started_at).getTime()) / 1000) : 0;
  const breakLimit = breakRow?.kind === "lunch" ? 30 * 60 : 15 * 60;
  const breakRemaining = breakLimit - onBreakSeconds;

  const isFriend = rel.kind === "friends";
  const profileLocked = !!profile.is_private && !isOwner && !isAdmin && !isFriend;

  if (profileLocked) {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
        <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
            {display}'s Profile
          </h1>
          <p className="text-purple-200/80 mt-1">@{profile.username ?? "unknown"}</p>
        </header>
        <div className="px-8 py-10 grid place-items-center">
          <div className="max-w-md w-full rounded-2xl border border-purple-500/40 bg-purple-950/50 backdrop-blur p-8 text-center text-white shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
            <div className="size-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center mb-4">
              <Lock className="size-6" />
            </div>
            <h2 className="font-display text-xl font-bold mb-2">This profile is private</h2>
            <p className="text-sm text-purple-200/80 mb-5">
              {display} has chosen to keep their profile private. Send a friend request — once accepted, you'll be able to view their full profile.
            </p>
            {viewer && rel.kind !== "self" && (
              <div className="flex justify-center">
                <FriendActionButton
                  rel={rel}
                  busy={relBusy}
                  onSend={sendFriendRequest}
                  onAccept={acceptFriendRequest}
                  onRemove={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const tabDefs = [
    { id: "welcome", label: "Welcome" },
    { id: "profile", label: "Profile" },
    ...(canSeeCreds ? [{ id: "creds", label: "Credentials" }] : []),
    { id: "tickets", label: `Tickets (${tickets.length})` },
    { id: "orders", label: `Orders (${orders.length})` },
    { id: "friends", label: `Friends (${friends.length})` },
    ...(canSeeReferrals ? [{ id: "referrals", label: `Referrals (${referrals.length})` }] : []),
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
          {isOwner ? "Your Profile" : `${display}'s Profile`}
        </h1>
        <p className="text-purple-200/80 mt-1">
          {isOwner
            ? "Manage your details, credentials, activity, and referrals — all in one place."
            : `View ${display}'s public information and activity.`}
        </p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-purple-950/60 border border-purple-500/30">
            {tabDefs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Welcome */}
          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)] text-white">
              <div className="flex items-center gap-4 mb-4">
                <Avatar url={profile.avatar_url} name={display} size={72} ring />
                <div>
                  <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-200 to-blue-200 bg-clip-text text-transparent">
                    {isOwner ? `Welcome back, ${display}` : `Welcome to ${display}'s profile`}
                  </h2>
                  <p className="text-purple-200/80">@{profile.username ?? "unknown"}</p>
                </div>
              </div>
              <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                {isOwner
                  ? "Use the tabs to update your profile, view your credentials, track tickets and orders, and manage your invites."
                  : "Browse the tabs to see this member's profile, recent activity, and shared information."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedRoles.map((r) => (
                  <span key={r} className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", ROLE_STYLES[r])}>
                    {r}
                  </span>
                ))}
                {breakRow ? (
                  <StatusPill
                    icon={breakRow.kind === "lunch" ? UtensilsCrossed : Coffee}
                    tone={breakRemaining < 0 ? "danger" : "warn"}
                    label={`On ${breakRow.kind} — ${fmt(Math.max(0, breakRemaining))}${breakRemaining < 0 ? " over" : " left"}`}
                  />
                ) : shift ? (
                  <StatusPill icon={ClockIcon} tone="ok" label={`On shift — ${fmt(onShiftSeconds)}`} />
                ) : sortedRoles.some((r) => ["admin","management","staff","moderator"].includes(r)) ? (
                  <StatusPill icon={ClockIcon} tone="muted" label="Off shift" />
                ) : null}
              </div>
              <Button
                className="mt-6 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50"
                onClick={() => setMainTab("profile")}
              >
                Open profile
              </Button>
            </div>
          </TabsContent>

          {/* Profile */}
          <TabsContent value="profile" className="mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <section className="lg:col-span-2 rounded-2xl border border-purple-500/30 bg-purple-950/50 backdrop-blur overflow-hidden text-white">
                <div
                  className="h-36 sm:h-44 bg-cover bg-center"
                  style={{ backgroundImage: `url(${profileHeader})` }}
                  aria-hidden
                />
                <div className="px-6 pb-6 -mt-12 flex flex-col sm:flex-row sm:items-end gap-4">
                  <Avatar url={profile.avatar_url} name={display} size={96} ring />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-2xl font-bold truncate">{display}</h2>
                      {sortedRoles.map((r) => (
                        <span key={r} className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", ROLE_STYLES[r])}>
                          {r}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-purple-200/80">@{profile.username ?? "unknown"}</p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setEditing(true)}
                      className="self-start sm:self-end flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium text-sm shadow-lg shadow-purple-900/50"
                    >
                      <Pencil className="size-4" /> Edit profile
                    </button>
                  )}
                  {!isOwner && viewer && (
                    <FriendActionButton rel={rel} busy={relBusy} onSend={sendFriendRequest} onAccept={acceptFriendRequest} onRemove={() => rel.kind === "friends" && removeFriend(rel.id)} />
                  )}
                </div>
                <div className="px-6 pb-6">
                  <p className="text-xs uppercase tracking-wider text-amber-100/80 mb-2">Bio</p>
                  <p className="text-sm whitespace-pre-wrap text-purple-50">
                    {profile.bio || <span className="text-purple-200/60 italic">No bio yet.</span>}
                  </p>
                </div>
              </section>
              <aside className="space-y-4">
                <InfoCard label="Member since" value={new Date(profile.created_at).toLocaleDateString()} />
                <InfoCard label="Roles" value={sortedRoles.join(", ") || "—"} />
                <InviteCard info={inviteInfo} showStats={isOwner || isAdmin} isOwner={isOwner} />
              </aside>
            </div>
          </TabsContent>

          {canSeeCreds && (
            <TabsContent value="creds" className="mt-6">
              <div className="space-y-6">
                <div className="rounded-2xl overflow-hidden border border-purple-500/30 bg-purple-950/50 backdrop-blur shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
                  <div className="grid md:grid-cols-[1.4fr_1fr]">
                    <img
                      src={tvLoginIllustration}
                      alt="Customer relaxing on a sofa logging into their TV app"
                      width={1920}
                      height={1080}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="p-6 flex flex-col justify-center text-white bg-gradient-to-br from-fuchsia-600/20 via-purple-600/20 to-violet-700/20">
                      <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-200/80 mb-2">Your TV Credentials</p>
                      <h3 className="font-display text-2xl font-bold bg-gradient-to-r from-violet-200 to-blue-200 bg-clip-text text-transparent">
                        Sign in to your TV app
                      </h3>
                      <p className="mt-3 text-sm text-purple-100/90">
                        Grab your remote, head to the BM Support app on your TV, and use the credentials below to sign in. Keep them private — your password unlocks everything.
                      </p>
                      <div className="mt-5">
                        <CredentialsReveal targetUserId={profile.id} isOwner={isOwner} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="tickets" className="mt-6">
            <ActivityCard title="Recent tickets" icon={Ticket} empty="No tickets yet">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{t.subject}</span>
                  <span className="text-xs text-white/70 capitalize">{t.status}</span>
                </li>
              ))}
            </ActivityCard>
          </TabsContent>

          <TabsContent value="orders" className="mt-6">
            <ActivityCard title="Recent orders" icon={ShoppingBag} empty="No orders yet">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{fmtCurrency(o.total_cents)}</span>
                  <span className="text-xs text-white/70 capitalize">{o.status}</span>
                </li>
              ))}
            </ActivityCard>
          </TabsContent>

          <TabsContent value="friends" className="mt-6">
            <ActivityCard title={isOwner ? "Your friends" : `${display}'s friends`} icon={UserPlus} empty={isOwner ? "No friends yet. Visit a member's profile and send a friend request." : "No friends yet."}>
              {friends.map((f) => (
                <li key={f.friendship_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link
                    to="/u/$username"
                    params={{ username: f.username ?? "" }}
                    className="flex items-center gap-3 min-w-0 hover:underline"
                  >
                    <Avatar url={f.avatar_url} name={f.display_name || f.username || "Member"} size={32} />
                    <span className="truncate">{f.display_name || f.username || "Member"}</span>
                    {f.username && <span className="text-xs text-white/60">@{f.username}</span>}
                  </Link>
                  {isOwner && (
                    <button
                      onClick={() => removeFriend(f.friendship_id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-rose-500/20 text-white/80 hover:text-rose-200"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  )}
                </li>
              ))}
            </ActivityCard>
          </TabsContent>

          {canSeeReferrals && (
            <TabsContent value="referrals" className="mt-6">
              <ReferralsPanel
                referrals={referrals}
                isOwner={isOwner}
                creating={creatingInvite}
                copiedCode={copiedCode}
                onCreate={createInvite}
                onCopy={copyInviteLink}
                onDelete={deleteInvite}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {editing && isOwner && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </div>
  );
}

function Avatar({ url, name, size = 40, ring }: { url: string | null; name: string; size?: number; ring?: boolean }) {
  return AvatarImpl({ url, name, size, ring });
}

function FriendActionButton({
  rel, busy, onSend, onAccept, onRemove,
}: {
  rel: FriendRel;
  busy: boolean;
  onSend: () => void;
  onAccept: () => void;
  onRemove: () => void;
}) {
  if (rel.kind === "self") return null;
  const base = "self-start sm:self-end flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium text-sm shadow-lg shadow-purple-900/50 disabled:opacity-60";
  if (rel.kind === "none")
    return (
      <button disabled={busy} onClick={onSend} className={cn(base, "bg-gradient-to-r from-violet-600 to-blue-600")}>
        <UserPlus className="size-4" /> Add friend
      </button>
    );
  if (rel.kind === "outgoing")
    return (
      <button disabled className={cn(base, "bg-white/10 cursor-default")}>
        <ClockIcon className="size-4" /> Request pending
      </button>
    );
  if (rel.kind === "incoming")
    return (
      <button disabled={busy} onClick={onAccept} className={cn(base, "bg-gradient-to-r from-emerald-600 to-teal-600")}>
        <Check className="size-4" /> Accept request
      </button>
    );
  return (
    <button disabled={busy} onClick={onRemove} className={cn(base, "bg-white/10 hover:bg-rose-500/20 text-rose-100")}>
      <Trash2 className="size-4" /> Remove friend
    </button>
  );
}

function AvatarImpl({ url, name, size = 40, ring }: { url: string | null; name: string; size?: number; ring?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-primary text-primary-foreground font-display font-bold grid place-items-center overflow-hidden shrink-0",
        ring && "ring-4 ring-background shadow-glow",
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      <img src={url || "/default-avatar.png"} alt={name} className="w-full h-full object-cover" />
    </div>
  );
}

function StatusPill({ icon: Icon, label, tone }: { icon: any; label: string; tone: "ok" | "warn" | "danger" | "muted" }) {
  const cls = {
    ok: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    muted: "bg-surface-2 text-muted-foreground border-border",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border font-medium", cls)}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

function ActivityCard({ title, icon: Icon, children, empty }: { title: string; icon: any; children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <section className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-5 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] text-white">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold mb-2">
        <Icon className="size-4 text-amber-200" /> {title}
      </h2>
      {isEmpty ? (
        <p className="text-sm text-white/70">{empty}</p>
      ) : (
        <ul className="divide-y divide-white/15">{children}</ul>
      )}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-4 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] text-white">
      <p className="text-xs uppercase tracking-wider text-amber-100/80">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function InviteCard({
  info,
  showStats,
  isOwner,
}: {
  info: InviteSummary | null;
  showStats: boolean;
  isOwner: boolean;
}) {
  if (!info) return null;
  const inviterLabel = info.invitedBy?.display_name ?? info.invitedBy?.username ?? null;
  return (
    <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-5 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] text-white space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-amber-200" />
        <p className="text-xs uppercase tracking-wider text-amber-100/80">Invites</p>
      </div>

      {showStats && (
        <div className="grid grid-cols-3 gap-2">
          <InviteStat label="Sent" value={info.sent} />
          <InviteStat label="Joined" value={info.used} />
          <InviteStat label="Bonuses" value={info.bonusPaid} />
        </div>
      )}

      <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-sm">
        <div className="flex items-center gap-2 text-white/80 mb-1">
          <UserPlus className="size-3.5" />
          <span className="text-xs uppercase tracking-wider">Invited by</span>
        </div>
        {inviterLabel ? (
          <>
            <p className="font-medium truncate">{inviterLabel}</p>
            {info.invitedBy?.username && (
              <Link
                to="/u/$username"
                params={{ username: info.invitedBy.username }}
                className="text-xs text-amber-200 hover:underline"
              >
                @{info.invitedBy.username}
              </Link>
            )}
            {info.invitedAt && (
              <p className="text-[11px] text-white/60 mt-1">
                Joined {new Date(info.invitedAt).toLocaleDateString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-white/60 italic text-sm">Joined through the gate</p>
        )}

        {(isOwner || showStats) && inviterLabel && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <Gift className="size-3.5 text-fuchsia-200" />
            <span className="text-white/80">Referral bonus</span>
            {info.invitedBonusPaid ? (
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium ml-auto">
                <Check className="size-3.5" /> Added
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-300 font-medium ml-auto">
                <XIcon className="size-3.5" /> Not yet
              </span>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <Link
          to="/leaderboard"
          className="flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-white text-rose-600 hover:bg-white/90 transition-colors"
        >
          <Trophy className="size-4" /> Open leaderboard
        </Link>
      )}
    </div>
  );
}

function InviteStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/10 border border-white/15 px-2 py-2 text-center">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/70">{label}</div>
    </div>
  );
}

function ReferralsPanel({
  referrals,
  isOwner,
  creating,
  copiedCode,
  onCreate,
  onCopy,
  onDelete,
}: {
  referrals: ReferralRow[];
  isOwner: boolean;
  creating: boolean;
  copiedCode: string | null;
  onCreate: () => void;
  onCopy: (code: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-5 text-white shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="size-4 text-amber-200" /> Referrals
        </h2>
        {isOwner && (
          <button
            onClick={onCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-rose-600 font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-60"
          >
            <Plus className="size-4" /> {creating ? "Creating…" : "New invite"}
          </button>
        )}
      </div>

      {referrals.length === 0 ? (
        <p className="text-sm text-white/70">
          {isOwner
            ? "You haven't created any invites yet. Generate one to invite a friend."
            : "No referrals yet."}
        </p>
      ) : (
        <ul className="divide-y divide-white/15">
          {referrals.map((r) => {
            const used = !!r.used_by;
            return (
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="font-mono text-sm font-bold tracking-widest text-amber-100 shrink-0">
                  {r.code}
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    used
                      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                      : "bg-white/10 text-white/80 border-white/30",
                  )}
                >
                  {used ? "Joined" : "Active"}
                </span>
                <div className="flex-1 min-w-[140px] text-sm">
                  {used ? (
                    r.joined_username ? (
                      <Link
                        to="/u/$username"
                        params={{ username: r.joined_username }}
                        className="text-white hover:text-amber-200 hover:underline truncate"
                      >
                        {r.joined_name ?? r.joined_username}
                      </Link>
                    ) : (
                      <span className="text-white/80">{r.joined_name ?? "Member"}</span>
                    )
                  ) : (
                    <span className="text-white/60 italic">Awaiting signup</span>
                  )}
                </div>
                {used && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border",
                      r.referral_bonus_paid
                        ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-200 border-rose-500/30",
                    )}
                    title="Referral bonus"
                  >
                    <Gift className="size-3" />
                    {r.referral_bonus_paid ? <Check className="size-3" /> : <XIcon className="size-3" />}
                  </span>
                )}
                {isOwner && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => onCopy(r.code)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
                    >
                      {copiedCode === r.code ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedCode === r.code ? "Copied" : "Copy link"}
                    </button>
                    {!used && (
                      <button
                        onClick={() => onDelete(r.id)}
                        className="p-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-rose-200"
                        title="Delete invite"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Credentials reveal (PIN+password gate) ---------------- */

function CredentialsReveal({ targetUserId, isOwner }: { targetUserId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [creds, setCreds] = useState<CredRow[]>([]);
  const [dns, setDns] = useState<DnsRow[]>([]);
  const [tab, setTab] = useState<"creds" | "dns">("creds");
  const [loading, setLoading] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("vault_pins").select("user_id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setHasPin(!!data));
  }, [user]);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    Promise.all([
      supabase.from("app_credentials").select("*").eq("owner_id", targetUserId).order("created_at", { ascending: false }),
      supabase.from("qd_dns_codes").select("*").order("label", { ascending: true }),
    ]).then(([{ data: c }, { data: d }]) => {
      setCreds((c ?? []) as CredRow[]);
      setDns((d ?? []) as DnsRow[]);
      setLoading(false);
    });
    const t = setTimeout(() => setUnlocked(false), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [unlocked, targetUserId]);

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-5 text-white shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)]">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-4 text-primary" /> Credentials & DNS
          </h2>
          {unlocked && (
            <button onClick={() => setUnlocked(false)} className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-lg bg-surface-2 border border-border hover:border-primary">
              <Lock className="size-3.5" /> Lock
            </button>
          )}
        </div>
        {unlocked && !loading && (
          <div className="mt-3 -mx-1 overflow-x-auto sm:overflow-visible scrollbar-thin">
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-surface-2 border border-border w-max max-w-full sm:w-fit">
              {([
                { id: "creds", label: `App Credentials (${creds.length})` },
                { id: "dns", label: `QD DNS Codes (${dns.length})` },
              ] as const).map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    tab === t.id ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground")}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!unlocked ? (
        <RevealGate
          hasPin={hasPin}
          onUnlocked={() => setUnlocked(true)}
          onPinSet={() => setHasPin(true)}
        />
      ) : loading ? (
        <div className="grid place-items-center py-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <>
          {tab === "creds" ? (
            creds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isOwner ? "No credentials assigned to you yet. An admin will set them up." : "This member has no credentials assigned."}
              </p>
            ) : (
              <ul className="space-y-3">
                {creds.map((c) => {
                  const expired = c.expiry_at ? new Date(c.expiry_at).getTime() < Date.now() : false;
                  const expSoon = c.expiry_at && !expired && new Date(c.expiry_at).getTime() - Date.now() < 7 * 86400_000;
                  return (
                    <li key={c.id} className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <AtSign className="size-4 text-primary shrink-0" />
                          <div className="font-display font-semibold truncate">{c.app_login_name}</div>
                        </div>
                        {c.expiry_at && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border whitespace-nowrap",
                            expired ? "text-destructive border-destructive/30 bg-destructive/10"
                            : expSoon ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                            : "text-muted-foreground border-border")}>
                            {expired ? "Expired" : "Active"}
                          </span>
                        )}
                      </div>

                      <FieldRow icon={KeyRound} label="App login name" value={c.app_login_name} onCopy={() => copy(`name-${c.id}`, c.app_login_name)} copied={copied === `name-${c.id}`} />

                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Lock className="size-3" /> Password</p>
                        <div className="flex items-center gap-2">
                          <input readOnly type={reveal[c.id] ? "text" : "password"} value={c.password}
                            className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-border text-sm font-mono" />
                          <button onClick={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))}
                            className="p-2 rounded-md bg-background border border-border hover:border-primary" title={reveal[c.id] ? "Hide" : "Reveal"}>
                            {reveal[c.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                          <button onClick={() => copy(c.id, c.password)}
                            className="p-2 rounded-md bg-background border border-border hover:border-primary" title="Copy">
                            {copied === c.id ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Calendar className="size-3" /> Expiry</p>
                        <p className={cn("text-sm",
                          expired ? "text-destructive" : expSoon ? "text-amber-500" : "text-foreground")}>
                          {c.expiry_at ? new Date(c.expiry_at).toLocaleString() : "No expiry set"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><StickyNote className="size-3" /> Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{c.notes || <span className="text-muted-foreground">—</span>}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            dns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No QD DNS codes have been added yet.</p>
            ) : (
              <ul className="space-y-3">
                {dns.map((d) => (
                  <li key={d.id} className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="size-4 text-primary shrink-0" />
                      <div className="font-display font-semibold truncate">{d.label}</div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">DNS code</p>
                      <div className="flex items-center gap-2">
                        <input readOnly value={d.code}
                          className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-border text-sm font-mono" />
                        <button onClick={() => copy(`dns-${d.id}`, d.code)}
                          className="p-2 rounded-md bg-background border border-border hover:border-primary" title="Copy">
                          {copied === `dns-${d.id}` ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                        </button>
                      </div>
                    </div>
                    {d.notes && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><StickyNote className="size-3" /> Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{d.notes}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </section>
  );
}

function FieldRow({ icon: Icon, label, value, onCopy, copied }: { icon: any; label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Icon className="size-3" /> {label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={value} className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-border text-sm" />
        <button onClick={onCopy} className="p-2 rounded-md bg-background border border-border hover:border-primary" title="Copy">
          {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function RevealGate({ hasPin, onUnlocked, onPinSet }: { hasPin: boolean | null; onUnlocked: () => void; onPinSet: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"unlock" | "reset">("unlock");

  if (hasPin === null) return <div className="grid place-items-center py-6 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;

  if (!hasPin) {
    const setupPin = async () => {
      if (!user) return;
      if (pin.length < 4) return toast.error("PIN must be at least 4 characters");
      if (pin !== confirmPin) return toast.error("PINs do not match");
      setBusy(true);
      try {
        const hash = await sha256Hex(`${user.id}:${pin}`);
        const { error } = await supabase.from("vault_pins").upsert({ user_id: user.id, pin_hash: hash });
        if (error) throw error;
        toast.success("PIN set. Now enter your password and PIN to reveal.");
        setPin(""); setConfirmPin("");
        onPinSet();
      } catch (e: any) {
        toast.error(e.message ?? "Failed to set PIN");
      } finally { setBusy(false); }
    };
    return (
      <div className="rounded-xl bg-surface-2 border border-border p-4 text-sm">
        <p className="text-muted-foreground mb-3">Set a personal PIN (min 4 chars). You'll need it plus your account password to reveal credentials.</p>
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="New PIN"
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm" />
          <input value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} type="password" placeholder="Confirm PIN"
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm" />
        </div>
        <button onClick={setupPin} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Save PIN
        </button>
      </div>
    );
  }

  const unlock = async () => {
    if (!user?.email) return;
    if (!password || !pin) return toast.error("Enter password and PIN");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { data: row } = await supabase.from("vault_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
      if (!row || row.pin_hash !== hash) throw new Error("Incorrect PIN");
      onUnlocked();
    } catch (e: any) {
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

  const resetPin = async () => {
    if (!user?.email) return;
    if (!password) return toast.error("Enter your account password");
    if (pin.length < 4) return toast.error("PIN must be at least 4 characters");
    if (pin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { error } = await supabase.from("vault_pins").upsert({ user_id: user.id, pin_hash: hash });
      if (error) throw error;
      toast.success("Vault PIN reset. Please unlock with your new PIN.");
      setPassword(""); setPin(""); setConfirmPin("");
      setMode("unlock");
    } catch (e: any) {
      toast.error(e.message ?? "Reset failed");
    } finally { setBusy(false); }
  };

  if (mode === "reset") {
    return (
      <div className="rounded-xl bg-surface-2 border border-border p-4">
        <p className="text-sm text-muted-foreground mb-3">Confirm your account password, then choose a new vault PIN.</p>
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password"
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="New PIN (min 4)"
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm" />
          <input value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} type="password" placeholder="Confirm new PIN"
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
            onKeyDown={(e) => e.key === "Enter" && resetPin()} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetPin} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Save new PIN
          </button>
          <button
            type="button"
            onClick={() => { setMode("unlock"); setPin(""); setConfirmPin(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-2 border border-border p-4">
      <p className="text-sm text-muted-foreground mb-3">Enter your account password and vault PIN to reveal credentials.</p>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm" />
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="Vault PIN"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
          onKeyDown={(e) => e.key === "Enter" && unlock()} />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={unlock} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Reveal credentials
        </button>
        <button
          type="button"
          onClick={() => { setMode("reset"); setPin(""); setConfirmPin(""); }}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Forgot your PIN? Reset it
        </button>
      </div>
    </div>
  );
}

/* ---------------- Edit profile modal ---------------- */

function EditProfileModal({ profile, onClose, onSaved }: { profile: ProfileRow; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [isPrivate, setIsPrivate] = useState<boolean>(!!profile.is_private);
  const [timezone, setTimezone] = useState<string>(
    profile.timezone ?? (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
    })(),
  );
  const tzOptions = useMemo(() => listTimeZones(), []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const upload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Avatar uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setUploading(false); }
  };

  const save = async () => {
    if (!user) return;
    const u = username.trim();
    if (!u || !/^[a-zA-Z0-9_-]{2,32}$/.test(u)) return toast.error("Username: 2–32 letters, numbers, _ or -");
    if (displayName.length > 64) return toast.error("Display name too long");
    if (bio.length > 500) return toast.error("Bio too long (500 max)");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName.trim() || null,
      username: u,
      bio: bio.trim() || null,
      avatar_url: avatarUrl,
      is_private: isPrivate,
      timezone: timezone || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    if (u !== profile.username) {
      window.location.href = `/u/${u}`;
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-bold mb-4">Edit profile</h2>
        <div className="flex items-center gap-4 mb-4">
          <Avatar url={avatarUrl} name={displayName || username || "?"} size={72} />
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm cursor-pointer hover:border-primary">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Upload image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {avatarUrl && (
            <button onClick={() => setAvatarUrl(null)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
          )}
        </div>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
        </Field>
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
        </Field>
        <Field label="Bio">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm resize-none" />
        </Field>
        <Field label="Timezone">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm"
          >
            {tzOptions.map((z: string) => (
              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
            ))}
          </select>
          <span className="block text-[11px] text-muted-foreground mt-1">
            Used to display expiry dates and times in your local zone.
          </span>
        </Field>
        <label className="flex items-start gap-3 mb-3 p-3 rounded-lg bg-surface-2 border border-border cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="size-3.5" /> Private profile
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Only you, your friends, and admins can view your profile. Others will see a notice that the profile is private.
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}