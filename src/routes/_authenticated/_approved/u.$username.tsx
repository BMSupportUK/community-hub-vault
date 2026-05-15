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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import profileHeader from "@/assets/profile-header.jpg";

export const Route = createFileRoute("/_authenticated/_approved/u/$username")({
  component: ProfilePage,
});

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
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

const ROLE_STYLES: Record<AppRole, string> = {
  admin: "bg-destructive/15 text-destructive border-destructive/30",
  management: "bg-primary/15 text-primary border-primary/30",
  moderator: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  staff: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  member: "bg-surface-2 text-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
  banned: "bg-destructive text-destructive-foreground border-destructive",
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
  const { user: viewer, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [now, setNow] = useState(() => Date.now());
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [breakRow, setBreakRow] = useState<BreakRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [inviteInfo, setInviteInfo] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [mainTab, setMainTab] = useState<"creds" | "tickets" | "orders">(
    "creds",
  );
  const [profileTab, setProfileTab] = useState<"creds" | "tickets" | "orders" | "referrals">("creds");

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

    setLoading(false);
  };

  useEffect(() => { load(); }, [username]);

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

  return (
    <main className="flex-1 overflow-y-auto relative bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 text-white">
      <div className="absolute inset-0 -z-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(244,63,94,0.55),_transparent_55%),radial-gradient(ellipse_at_top_right,_rgba(168,85,247,0.45),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(251,191,36,0.45),_transparent_60%)]" aria-hidden />
      <div className="relative">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header card */}
        <section className="rounded-2xl border border-white/30 bg-white/10 backdrop-blur-xl overflow-hidden shadow-[0_25px_60px_-20px_rgba(0,0,0,0.45)]">
          <div
            className="h-36 sm:h-44 bg-cover bg-center"
            style={{ backgroundImage: `url(${profileHeader})` }}
            aria-hidden
          />
          <div className="px-6 pb-6 -mt-12 flex flex-col sm:flex-row sm:items-end gap-4">
            <Avatar url={profile.avatar_url} name={display} size={96} ring />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl font-bold truncate">{display}</h1>
                {sortedRoles.map((r) => (
                  <span key={r} className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", ROLE_STYLES[r])}>
                    {r}
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">@{profile.username ?? "unknown"}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {breakRow ? (
                  <StatusPill
                    icon={breakRow.kind === "lunch" ? UtensilsCrossed : Coffee}
                    tone={breakRemaining < 0 ? "danger" : "warn"}
                    label={`On ${breakRow.kind} — ${fmt(Math.max(0, breakRemaining))}${breakRemaining < 0 ? " over" : " left"}`}
                  />
                ) : shift ? (
                  <StatusPill icon={ClockIcon} tone="ok" label={`On shift — ${fmt(onShiftSeconds)}`} />
                ) : (
                  <StatusPill icon={ClockIcon} tone="muted" label="Off shift" />
                )}
              </div>
            </div>

            {isOwner && (
              <button
                onClick={() => setEditing(true)}
                className="self-start sm:self-end flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-glow"
              >
                <Pencil className="size-4" /> Edit profile
              </button>
            )}
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white/10 border border-white/25 backdrop-blur-xl w-fit">
              {([
                ...(canSeeCreds ? [{ id: "creds" as const, label: "Credentials & DNS", icon: KeyRound }] : []),
                { id: "tickets" as const, label: `Recent tickets (${tickets.length})`, icon: Ticket },
                { id: "orders" as const, label: `Recent orders (${orders.length})`, icon: ShoppingBag },
              ]).map((t) => {
                const Icon = t.icon;
                const active = mainTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setMainTab(t.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      active
                        ? "bg-white text-rose-600 shadow"
                        : "text-white/80 hover:text-white hover:bg-white/10",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {mainTab === "creds" && canSeeCreds && (
              <CredentialsReveal targetUserId={profile.id} isOwner={isOwner} />
            )}

            {mainTab === "tickets" && (
              <ActivityCard title="Recent tickets" icon={Ticket} empty="No tickets yet">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate">{t.subject}</span>
                    <span className="text-xs text-white/70 capitalize">{t.status}</span>
                  </li>
                ))}
              </ActivityCard>
            )}

            {mainTab === "orders" && (
              <ActivityCard title="Recent orders" icon={ShoppingBag} empty="No orders yet">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>${(o.total_cents / 100).toFixed(2)}</span>
                    <span className="text-xs text-white/70 capitalize">{o.status}</span>
                  </li>
                ))}
              </ActivityCard>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl p-5 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] text-white">
              <p className="text-xs uppercase tracking-wider text-amber-100/80 mb-2">Bio</p>
              <p className="text-sm whitespace-pre-wrap">
                {profile.bio || <span className="text-white/60 italic">No bio yet.</span>}
              </p>
            </div>
            <InfoCard label="Member since" value={new Date(profile.created_at).toLocaleDateString()} />
            <InfoCard label="Roles" value={sortedRoles.join(", ") || "—"} />
            <InviteCard
              info={inviteInfo}
              showStats={isOwner || isAdmin}
              isOwner={isOwner}
            />
          </aside>
        </div>
      </div>

      {editing && isOwner && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
      </div>
    </main>
  );
}

function Avatar({ url, name, size = 40, ring }: { url: string | null; name: string; size?: number; ring?: boolean }) {
  const initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-primary text-primary-foreground font-display font-bold grid place-items-center overflow-hidden shrink-0",
        ring && "ring-4 ring-background shadow-glow",
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials || "?"}</span>
      )}
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
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <KeyRound className="size-4 text-primary" /> Credentials & DNS
        </h2>
        {unlocked && (
          <button onClick={() => setUnlocked(false)} className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-lg bg-surface-2 border border-border hover:border-primary">
            <Lock className="size-3.5" /> Lock
          </button>
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
          <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border border-border w-fit mb-4">
            {([
              { id: "creds", label: `App Credentials (${creds.length})` },
              { id: "dns", label: `QD DNS Codes (${dns.length})` },
            ] as const).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  tab === t.id ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>

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
      <button onClick={unlock} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Reveal credentials
      </button>
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