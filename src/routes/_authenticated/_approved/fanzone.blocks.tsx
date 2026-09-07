import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Loader2, Search, ShieldCheck, ShieldOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FanZoneNameGate } from "@/components/app/FanZoneNamePrompt";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useProtectedUsers, protectedRoleLabel } from "@/hooks/use-protected-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ignoreBg from "@/assets/fanzone-ignore-bg.jpg";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/blocks")({
  component: BlocksPage,
  head: () => ({
    meta: [
      { title: "Ignore list — Boro Fan Zone" },
      {
        name: "description",
        content: "Manage the Boro Fan Zone members you've blocked, and block new members from one place.",
      },
      { property: "og:title", content: "Ignore list — Boro Fan Zone" },
      {
        property: "og:description",
        content: "Manage the Boro Fan Zone members you've blocked, and block new members from one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Row = { blocked_id: string; fan_alias: string; fan_avatar_url: string; created_at: string };
type Member = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null };

function BlocksPage() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";
  const { protectedRoleOf } = useProtectedUsers();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase.rpc("list_my_fan_blocks");
    setRows((data ?? []) as Row[]);
  };

  const loadMembers = async () => {
    if (!user) return;
    const { data, error } = await (
      supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>
    )("list_fan_zone_approved_members");
    if (error) return;
    setMembers(((data ?? []) as Member[]).filter((m) => m.user_id !== user.id));
  };

  useEffect(() => {
    if (!canEnter) return;
    void load();
    void loadMembers();
  }, [canEnter, user?.id]);

  const blockedIds = useMemo(() => new Set((rows ?? []).map((r) => r.blocked_id)), [rows]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members.filter((m) => (m.fan_alias ?? "").toLowerCase().includes(q)).slice(0, 10);
  }, [members, search]);

  const block = async (id: string, name: string) => {
    const role = protectedRoleOf(id);
    if (role) {
      toast.error(`${name} is ${protectedRoleLabel(role) || "staff"} — protected and can't be blocked`);
      return;
    }
    setBusy(id);
    const { error } = await supabase.rpc("fan_zone_block", { _other: id });
    setBusy(null);
    if (error) {
      toast.error("Couldn't block", { description: error.message });
      return;
    }
    toast.success(`${name} blocked`);
    setSearch("");
    void load();
  };

  const unblock = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("fan_zone_unblock", { _other: id });
    setBusy(null);
    if (error) return toast.error("Couldn't unblock", { description: error.message });
    toast.success("Unblocked");
    void load();
  };

  if (!canEnter) return <div className="p-6 text-sm text-center">Members only.</div>;

  return (
    <div className="boro-theme relative min-h-[calc(100vh-4rem)] w-full">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${ignoreBg})` }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(5,8,18,0.72) 0%, rgba(5,8,18,0.86) 55%, rgba(5,8,18,0.95) 100%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-5">
        <FanZoneNameGate />
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-white/80 hover:text-white">
          <Link to="/fanzone/messages">
            <ArrowLeft className="size-4 mr-1" />
            Back to inbox
          </Link>
        </Button>

        <header className="rounded-2xl border border-[#E11B22]/40 bg-black/45 backdrop-blur-md p-5 sm:p-7 shadow-[0_10px_40px_-12px_rgba(225,27,34,0.5)]">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#E11B22]">
            <ShieldOff className="size-3.5" /> Boro Fan Zone
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-black text-white">Ignore list</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/70">
            Members you've blocked. Their posts and topics are hidden from you, and you can't message each
            other. Block someone new below, or unblock at any time.
          </p>
        </header>

        {/* Block someone new */}
        <section className="rounded-2xl border border-white/15 bg-black/55 backdrop-blur-md p-4 sm:p-5">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Ban className="size-4 text-[#E11B22]" /> Block a member
          </h2>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Fan Zone members by name…"
              className="h-10 pl-9 pr-9 bg-white/5 border-white/20 text-white placeholder:text-white/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {search.trim() && (
            <ul className="mt-3 space-y-2">
              {results.length === 0 ? (
                <li className="rounded-xl border border-dashed border-white/20 p-4 text-center text-xs text-white/60">
                  No fans match that name.
                </li>
              ) : (
                results.map((m) => {
                  const name = m.fan_alias || "Boro Fan";
                  const role = protectedRoleOf(m.user_id);
                  const already = blockedIds.has(m.user_id);
                  return (
                    <li
                      key={m.user_id}
                      className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/5 p-2.5"
                    >
                      {m.fan_avatar_url ? (
                        <img src={m.fan_avatar_url} alt="" className="size-9 rounded-full object-cover" />
                      ) : (
                        <div className="size-9 rounded-full bg-gradient-to-br from-rose-600 to-amber-600 grid place-items-center text-white text-xs font-bold">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/fanzone/u/$userId"
                          params={{ userId: m.user_id }}
                          className="block truncate text-sm font-semibold text-white hover:text-[#E11B22] hover:underline"
                        >
                          {name}
                        </Link>
                        {role && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#F4B400]">
                            <ShieldCheck className="size-3" /> {protectedRoleLabel(role) || "Staff"} — protected
                          </span>
                        )}
                      </div>
                      {already ? (
                        <span className="text-[11px] text-white/50 px-2">Already blocked</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === m.user_id || !!role}
                          onClick={() => void block(m.user_id, name)}
                        >
                          {busy === m.user_id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Ban className="size-4 mr-1" />
                          )}
                          Block
                        </Button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </section>

        {/* Current list */}
        <section className="rounded-2xl border border-white/15 bg-black/55 backdrop-blur-md p-4 sm:p-5">
          <h2 className="text-sm font-bold text-white mb-3">
            Blocked members {rows ? `(${rows.length})` : ""}
          </h2>
          {rows === null ? (
            <div className="grid place-items-center py-12 text-white/60">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center text-sm text-white/60">
              You haven't blocked anyone.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.blocked_id}
                  className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/5 p-3"
                >
                  <Link to="/fanzone/u/$userId" params={{ userId: r.blocked_id }} className="shrink-0">
                    <img
                      src={r.fan_avatar_url}
                      alt=""
                      className="size-10 rounded-full object-cover ring-2 ring-white/10"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/fanzone/u/$userId"
                      params={{ userId: r.blocked_id }}
                      className="block font-semibold text-sm text-white truncate hover:text-[#E11B22] hover:underline"
                    >
                      {r.fan_alias}
                    </Link>
                    <div className="text-[11px] text-white/50">
                      Blocked {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.blocked_id}
                    onClick={() => void unblock(r.blocked_id)}
                  >
                    <ShieldOff className="size-4 mr-1" /> Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
