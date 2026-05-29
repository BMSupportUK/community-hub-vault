import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, Plus, Copy, Check, Trash2, Ticket, Crown, Medal, Award, X, Gift, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/leaderboard")({
  component: LeaderboardPage,
});

type LeaderRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  used_count: number;
  total_count: number;
};

type Invite = {
  id: string;
  code: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
  referral_bonus_paid: boolean;
  referral_bonus_paid_at: string | null;
};

type AdminInvite = Invite & {
  created_by: string;
  inviter_name: string | null;
  inviter_username: string | null;
  used_by_name: string | null;
  used_by_username: string | null;
};

function makeCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function LeaderboardPage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tab, setTab] = useState("welcome");
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [adminInvites, setAdminInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLeaderboard = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_invite_leaderboard");
    if (error) toast.error(error.message);
    setRows((data ?? []) as LeaderRow[]);
    setLoading(false);
  };

  const loadMyInvites = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("invites")
      .select("id, code, used_by, used_at, created_at, referral_bonus_paid, referral_bonus_paid_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setInvites((data ?? []) as Invite[]);
  };

  const loadAdminInvites = async () => {
    if (!isAdmin) return;
    const { data, error } = await supabase
      .from("invites")
      .select("id, code, used_by, used_at, created_at, referral_bonus_paid, referral_bonus_paid_at, created_by")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as (Invite & { created_by: string })[];
    const ids = Array.from(new Set(rows.flatMap((r) => [r.created_by, r.used_by].filter(Boolean) as string[])));
    let profileMap: Record<string, { display_name: string | null; username: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
      profileMap = Object.fromEntries((profs ?? []).map((p) => [p.id, { display_name: p.display_name, username: p.username }]));
    }
    setAdminInvites(
      rows.map((r) => ({
        ...r,
        inviter_name: profileMap[r.created_by]?.display_name ?? null,
        inviter_username: profileMap[r.created_by]?.username ?? null,
        used_by_name: r.used_by ? profileMap[r.used_by]?.display_name ?? null : null,
        used_by_username: r.used_by ? profileMap[r.used_by]?.username ?? null : null,
      })),
    );
  };

  useEffect(() => {
    loadLeaderboard();
    loadMyInvites();
    loadAdminInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const createInvite = async () => {
    if (!user) return;
    setCreating(true);
    // Try a few times in case of unique-constraint collisions
    for (let i = 0; i < 5; i++) {
      const code = makeCode(8);
      const { error } = await supabase.from("invites").insert({ code, created_by: user.id });
      if (!error) {
        toast.success(`Invite code ${code} created`);
        await loadMyInvites();
        setCreating(false);
        return;
      }
      if (!error.message.toLowerCase().includes("unique")) {
        toast.error(error.message);
        setCreating(false);
        return;
      }
    }
    toast.error("Could not generate a unique code, please try again");
    setCreating(false);
  };

  const copyInvite = async (inv: Invite) => {
    const link = `${window.location.origin}/signup?invite=${inv.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(inv.id);
      toast.success("Invite link copied");
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const deleteInvite = async (id: string) => {
    if (!confirm("Delete this invite?")) return;
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite deleted");
    loadMyInvites();
  };

  const toggleBonus = async (inv: { id: string; referral_bonus_paid: boolean }) => {
    const next = !inv.referral_bonus_paid;
    const { error } = await supabase
      .from("invites")
      .update({
        referral_bonus_paid: next,
        referral_bonus_paid_at: next ? new Date().toISOString() : null,
        referral_bonus_paid_by: next ? user?.id ?? null : null,
      })
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Marked bonus as paid" : "Bonus mark removed");
    loadMyInvites();
    loadAdminInvites();
  };

  const myStats = {
    total: invites.length,
    used: invites.filter((i) => i.used_by).length,
  };

  const rankIcon = (idx: number) => {
    if (idx === 0) return <Crown className="size-5 text-yellow-300" />;
    if (idx === 1) return <Medal className="size-5 text-gray-300" />;
    if (idx === 2) return <Award className="size-5 text-amber-500" />;
    return <span className="text-purple-300/60 text-sm font-mono w-5 text-center">#{idx + 1}</span>;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">Leaderboard</h1>
        <p className="text-purple-200/80 mt-1">Invite friends to the community and climb the ranks</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={`grid ${isAdmin ? "grid-cols-5 max-w-4xl" : "grid-cols-3 max-w-2xl"} bg-purple-950/60 border border-purple-500/30`}>
            <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
            <TabsTrigger value="leaderboard" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Leaderboard</TabsTrigger>
            <TabsTrigger value="invites" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">My Invites</TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="referrals" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Referrals</TabsTrigger>
                <TabsTrigger value="bonuses" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Bonuses</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
              <div className="flex items-center gap-3 mb-2">
                <div className="size-12 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center shadow-lg shadow-purple-900/50">
                  <Trophy className="size-6 text-white" />
                </div>
                <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">Welcome to the Leaderboard</h2>
              </div>
              <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                Spread the word and grow our community. Generate single-use invite codes to share with friends — no expiry, no fuss.
              </p>
              <p className="mt-4 text-purple-200/70 max-w-2xl">
                Anyone who signs up using your code skips the gate and joins the server instantly. The more friends you bring in, the higher you climb.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                <StatCard label="Your invites" value={myStats.total} />
                <StatCard label="Successful joins" value={myStats.used} />
                <StatCard label="Pending codes" value={myStats.total - myStats.used} />
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button onClick={() => setTab("invites")} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50">
                  <Plus className="size-4 mr-1" /> Create an invite
                </Button>
                <Button onClick={() => setTab("leaderboard")} variant="ghost" className="text-purple-100 hover:bg-purple-800/40 hover:text-white">
                  See the leaderboard
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-6">
            <div className="rounded-2xl bg-purple-950/50 border border-purple-500/30 overflow-hidden backdrop-blur">
              <div className="px-6 py-4 border-b border-purple-500/30 flex items-center justify-between">
                <h3 className="font-display font-semibold text-purple-50">Top inviters</h3>
                <span className="text-xs text-purple-300/70">Ranked by successful joins</span>
              </div>
              {loading ? (
                <div className="p-12 text-center text-purple-200/70">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-purple-200/70">
                  No invites yet — be the first to put yourself on the board!
                </div>
              ) : (
                <ul className="divide-y divide-purple-500/20">
                  {rows.map((r, idx) => {
                    const isMe = r.user_id === user?.id;
                    return (
                      <li
                        key={r.user_id}
                        className={`px-6 py-4 flex items-center gap-4 ${isMe ? "bg-fuchsia-500/10" : ""}`}
                      >
                        <div className="w-8 grid place-items-center shrink-0">{rankIcon(idx)}</div>
                        <div className="size-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center overflow-hidden shrink-0">
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="text-white font-semibold text-sm">
                              {(r.display_name ?? r.username ?? "?").slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-purple-50 truncate">
                            {r.display_name ?? r.username ?? "Member"}
                            {isMe && <span className="ml-2 text-xs text-fuchsia-300">(you)</span>}
                          </div>
                          {r.username && (
                            <div className="text-xs text-purple-300/70 truncate">@{r.username}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-display text-xl font-bold bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                            {r.used_count}
                          </div>
                          <div className="text-[11px] uppercase tracking-wider text-purple-300/70">
                            of {r.total_count} sent
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invites" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-purple-50">Your invite codes</h3>
                <p className="text-sm text-purple-300/70">Single-use, no expiry. Share the link with anyone you trust.</p>
              </div>
              <Button onClick={createInvite} disabled={creating} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
                <Plus className="size-4 mr-1" /> {creating ? "Creating…" : "New invite"}
              </Button>
            </div>

            {invites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                <Ticket className="size-10 mx-auto mb-3 text-purple-300/60" />
                You haven't created any invites yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invites.map((inv) => {
                  const used = !!inv.used_by;
                  return (
                    <div
                      key={inv.id}
                      className={`rounded-2xl border p-5 backdrop-blur transition-colors ${used ? "bg-purple-950/40 border-purple-500/20 opacity-70" : "bg-purple-950/50 border-purple-500/40 hover:border-fuchsia-500/60"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-wider text-purple-300/70 mb-1">Code</div>
                          <div className="font-mono text-2xl font-bold tracking-widest bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                            {inv.code}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md font-medium border ${used ? "bg-purple-800/40 text-purple-200 border-purple-500/30" : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"}`}>
                          {used ? "Used" : "Active"}
                        </span>
                      </div>
                      {used && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-purple-500/30 bg-purple-900/30 px-3 py-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Gift className="size-4 text-fuchsia-300" />
                            <span className="text-purple-100">Referral bonus</span>
                            {inv.referral_bonus_paid ? (
                              <span className="ml-1 inline-flex items-center gap-1 text-emerald-300 font-medium">
                                <Check className="size-4" /> Added
                              </span>
                            ) : (
                              <span className="ml-1 inline-flex items-center gap-1 text-rose-300 font-medium">
                                <X className="size-4" /> Not yet
                              </span>
                            )}
                          </div>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleBonus(inv)}
                              className="text-purple-100 hover:bg-purple-800/60 hover:text-white h-7"
                            >
                              {inv.referral_bonus_paid ? "Unmark" : "Mark added"}
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => copyInvite(inv)}
                          className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                        >
                          {copiedId === inv.id ? (
                            <><Check className="size-4 mr-1" /> Copied</>
                          ) : (
                            <><Copy className="size-4 mr-1" /> Copy invite link</>
                          )}
                        </Button>
                        {!used && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteInvite(inv.id)}
                            className="text-purple-200 hover:text-white hover:bg-purple-800/60"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-3 text-[11px] text-purple-300/60">
                        Created {new Date(inv.created_at).toLocaleDateString()}
                        {used && inv.used_at && ` · Used ${new Date(inv.used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="referrals" className="mt-6">
              <div className="mb-4">
                <h3 className="font-display text-xl font-semibold text-purple-50">Who invited who</h3>
                <p className="text-sm text-purple-300/70">Every invite grouped by inviter. Shows pending codes and successful joins.</p>
              </div>
              {adminInvites.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                  <Users className="size-10 mx-auto mb-3 text-purple-300/60" />
                  No invites yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Object.values(
                    adminInvites.reduce<Record<string, { inviter: string; username: string | null; invites: AdminInvite[] }>>((acc, inv) => {
                      const key = inv.created_by;
                      if (!acc[key]) {
                        acc[key] = {
                          inviter: inv.inviter_name ?? inv.inviter_username ?? "Member",
                          username: inv.inviter_username,
                          invites: [],
                        };
                      }
                      acc[key].invites.push(inv);
                      return acc;
                    }, {}),
                  )
                    .sort((a, b) => b.invites.filter((i) => i.used_by).length - a.invites.filter((i) => i.used_by).length)
                    .map((group) => {
                      const joined = group.invites.filter((i) => i.used_by);
                      return (
                        <div key={group.inviter + (group.username ?? "")} className="rounded-2xl bg-purple-950/50 border border-purple-500/30 overflow-hidden backdrop-blur hover:border-fuchsia-500/50 transition-colors flex flex-col">
                          <div className="px-5 py-4 border-b border-purple-500/30 bg-gradient-to-br from-fuchsia-600/15 via-purple-600/10 to-transparent">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-display font-semibold text-purple-50 truncate">
                                {group.inviter}
                                </div>
                                {group.username && <div className="text-purple-300/60 text-xs truncate">@{group.username}</div>}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-display text-xl font-bold bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent leading-none">
                                  {joined.length}
                                </div>
                                <div className="text-[10px] uppercase tracking-wider text-purple-300/70 mt-1">
                                  of {group.invites.length}
                                </div>
                              </div>
                            </div>
                          </div>
                          <ul className="divide-y divide-purple-500/20 flex-1">
                            {group.invites.map((inv) => {
                              const used = !!inv.used_by;
                              return (
                                <li key={inv.id} className="px-5 py-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-mono text-xs font-bold tracking-widest bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                                    {inv.code}
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${used ? "bg-purple-800/40 text-purple-200 border-purple-500/30" : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"}`}>
                                      {used ? "Used" : "Active"}
                                    </span>
                                  </div>
                                  <div>
                                    {used ? (
                                      <>
                                        <div className="text-[10px] uppercase tracking-wider text-purple-300/70">Joined</div>
                                        <div className="text-purple-50 text-sm truncate">
                                          {inv.used_by_name ?? inv.used_by_username ?? "Member"}
                                          {inv.used_by_username && <span className="text-purple-300/60 text-xs ml-1">@{inv.used_by_username}</span>}
                                        </div>
                                        {inv.used_at && <div className="text-purple-300/60 text-[11px]">{new Date(inv.used_at).toLocaleDateString()}</div>}
                                      </>
                                    ) : (
                                      <span className="text-xs text-purple-300/70">Created {new Date(inv.created_at).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                  {used && (
                                    inv.referral_bonus_paid ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-300 text-[11px] font-medium px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10">
                                        <Check className="size-3.5" /> Bonus added
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-rose-300 text-[11px] font-medium px-2 py-0.5 rounded-md border border-rose-500/30 bg-rose-500/10">
                                        <X className="size-3.5" /> Bonus pending
                                      </span>
                                    )
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              )}
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="bonuses" className="mt-6">
              <div className="mb-4">
                <h3 className="font-display text-xl font-semibold text-purple-50">Referral bonuses</h3>
                <p className="text-sm text-purple-300/70">Mark whether the inviter has received their referral bonus. Inviters see this status on their invites.</p>
              </div>
              {adminInvites.filter((i) => i.used_by).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                  <Gift className="size-10 mx-auto mb-3 text-purple-300/60" />
                  No used invites yet.
                </div>
              ) : (
                <div className="rounded-2xl bg-purple-950/50 border border-purple-500/30 overflow-hidden backdrop-blur">
                  <ul className="divide-y divide-purple-500/20">
                    {adminInvites.filter((i) => i.used_by).map((inv) => (
                      <li key={inv.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                        <div className="font-mono text-sm font-bold tracking-widest bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent shrink-0">
                          {inv.code}
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <div className="text-xs text-purple-300/70">Inviter</div>
                          <div className="text-purple-50 font-medium truncate">
                            {inv.inviter_name ?? inv.inviter_username ?? "Member"}
                            {inv.inviter_username && <span className="text-purple-300/60 text-xs ml-1">@{inv.inviter_username}</span>}
                          </div>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <div className="text-xs text-purple-300/70">Joined</div>
                          <div className="text-purple-50 truncate">
                            {inv.used_by_name ?? inv.used_by_username ?? "Member"}
                            {inv.used_at && <span className="text-purple-300/60 text-xs ml-2">{new Date(inv.used_at).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {inv.referral_bonus_paid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300 text-sm font-medium px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10">
                              <Check className="size-4" /> Added
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-300 text-sm font-medium px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/10">
                              <X className="size-4" /> Not added
                            </span>
                          )}
                          <Button
                            size="sm"
                            onClick={() => toggleBonus(inv)}
                            className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                          >
                            {inv.referral_bonus_paid ? "Unmark" : "Mark added"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-purple-950/50 border border-purple-500/30 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-purple-300/70">{label}</div>
      <div className="font-display text-2xl font-bold bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        {value}
      </div>
    </div>
  );
}