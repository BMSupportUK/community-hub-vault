import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, UserCheck, UserPlus, X, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BORO_DEFAULT_AVATAR_URL as boroDefaultAvatar } from "@/lib/boro-default-avatar";

type RequestRow = {
  id: string;
  user_id: string;
  fan_alias: string | null;
  fan_avatar_url: string | null;
  direction: "incoming" | "outgoing";
};

type Member = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null };

/**
 * Boro Fan Zone friend request inbox: incoming requests to accept or decline,
 * sent requests to cancel, and a search box to send new requests.
 * Only ever touches `fan_zone_friendships` (never BM Support `friendships`).
 */
export function FanZoneFriendRequestsBox({
  userId,
  compact = false,
  fullBleed = false,
}: {
  userId: string;
  compact?: boolean;
  /** Full-bleed edge-to-edge on phones (rounded card returns from sm up). */
  fullBleed?: boolean;
}) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [related, setRelated] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("fan_zone_friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const all = (data ?? []) as Array<{
      id: string;
      requester_id: string;
      addressee_id: string;
      status: string;
    }>;
    const otherOf = (f: (typeof all)[number]) => (f.requester_id === userId ? f.addressee_id : f.requester_id);
    // An accepted request sent by the other fan is their one-way friendship.
    // Keep that fan searchable so this user can independently add them back.
    setRelated(
      new Set(
        all
          .filter((f) => f.requester_id === userId || f.status !== "accepted")
          .map(otherOf),
      ),
    );
    const pending = all.filter((f) => f.status !== "accepted");
    if (pending.length === 0) {
      setRows([]);
      return;
    }
    const ids = Array.from(new Set(pending.map(otherOf)));
    const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: ids });
    const byId = new Map(((aliases as any[]) ?? []).map((m: any) => [m.user_id, m]));
    setRows(
      pending.map((f) => {
        const other = otherOf(f);
        const m = byId.get(other) as any;
        return {
          id: f.id,
          user_id: other,
          fan_alias: m?.fan_alias ?? null,
          fan_avatar_url: m?.fan_avatar_url ?? null,
          direction: f.addressee_id === userId ? ("incoming" as const) : ("outgoing" as const),
        };
      }),
    );
  };

  const loadMembers = async () => {
    const { data, error } = await (
      supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>
    )("list_fan_zone_approved_members");
    if (error) return;
    setMembers(((data ?? []) as Member[]).filter((m) => m.user_id !== userId));
  };

  useEffect(() => {
    void load();
    void loadMembers();
    const ch = supabase
      .channel(`fanzone-friend-requests:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_friendships" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => (m.fan_alias ?? "").toLowerCase().includes(q) && !related.has(m.user_id))
      .slice(0, 10);
  }, [members, search, related]);

  const incoming = (rows ?? []).filter((r) => r.direction === "incoming");
  const outgoing = (rows ?? []).filter((r) => r.direction === "outgoing");

  const accept = async (id: string) => {
    setBusy(id);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("addressee_id", userId);
    setBusy(null);
    if (error) return toast.error("Couldn't accept", { description: error.message });
    void load();
  };

  const drop = async (id: string, _msg: string) => {
    setBusy(id);
    const { error } = await supabase.from("fan_zone_friendships").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error("Action failed", { description: error.message });
    void load();
  };

  const send = async (id: string, name: string) => {
    setBusy(id);
    const { error } = await supabase
      .from("fan_zone_friendships")
      .insert({ requester_id: userId, addressee_id: id });
    setBusy(null);
    if (error) return toast.error("Couldn't send request", { description: error.message });
    toast.success(`Friend request sent to ${name}`);
    setSearch("");
    void load();
  };

  return (
    <div
      className={
        fullBleed
          ? "min-h-[calc(100vh-10rem)] border-y border-[#E11B22]/40 bg-black/55 p-4 text-white shadow-2xl backdrop-blur-md sm:min-h-0 sm:rounded-2xl sm:border sm:p-5"
          : "rounded-2xl border border-[#E11B22]/40 bg-black/55 backdrop-blur-md shadow-2xl text-white p-5"
      }
    >
      <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
        <UserPlus className="size-4 text-[#E11B22]" />
        Friend requests
        {incoming.length > 0 && (
          <span className="ml-1 rounded-full bg-[#E11B22] px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {incoming.length}
          </span>
        )}
      </h2>
      <p className="text-[11px] text-white/60 mb-4">
        Accept requests from other Boro fans, or search for a fan and send your own.
      </p>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fans by name…"
          className="h-11 border-white/20 bg-white/10 pl-9 text-white placeholder:text-white/45 sm:h-9"
        />
      </div>
      {search.trim() && (
        <div className="mb-4 space-y-2">
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/20 p-3 text-center text-xs text-white/55">
              No fans found to add.
            </div>
          ) : (
            results.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 p-2">
                <img src={m.fan_avatar_url || boroDefaultAvatar} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
                <span className="min-w-0 flex-1 break-words text-xs font-semibold">{m.fan_alias || "Boro fan"}</span>
                <Button
                  size="sm"
                  disabled={busy === m.user_id}
                  onClick={() => void send(m.user_id, m.fan_alias || "Boro fan")}
                  className="h-10 px-3 border-0 bg-[#E11B22] text-white hover:bg-[#c11419] sm:h-8"
                >
                  {busy === m.user_id ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {rows === null ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-4 animate-spin text-white/70" />
        </div>
      ) : (
        <div className="space-y-4">
          <RequestList
            title="Waiting for you"
            empty="No friend requests right now."
            rows={incoming}
            busy={busy}
            renderActions={(r) => (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={busy === r.id}
                  onClick={() => void accept(r.id)}
                  className="h-10 px-3 border-0 bg-emerald-600 text-white hover:bg-emerald-500 sm:h-8"
                >
                  {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => void drop(r.id, "Friend request declined")}
                  className="h-10 px-3 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:h-8"
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}
          />
          {(!compact || outgoing.length > 0) && (
            <RequestList
              title="Sent by you"
              empty="You haven't sent any requests."
              rows={outgoing}
              busy={busy}
              renderActions={(r) => (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.id}
                  onClick={() => void drop(r.id, "Friend request cancelled")}
                  className="h-10 px-4 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:h-8"
                >
                  {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : "Cancel"}
                </Button>
              )}
            />
          )}
        </div>
      )}

      {compact && (
        <Button asChild variant="outline" size="sm" className="mt-4 w-full border-white/30 bg-white/10 text-white hover:bg-white/20">
          <Link to="/fanzone/friend-requests">
            <Users className="mr-1 size-4" /> Open friend request inbox
          </Link>
        </Button>
      )}
    </div>
  );
}

function RequestList({
  title,
  empty,
  rows,
  busy,
  renderActions,
}: {
  title: string;
  empty: string;
  rows: RequestRow[];
  busy: string | null;
  renderActions: (row: RequestRow) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/65">{title}</div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/18 p-3 text-center text-xs text-white/55">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] p-2.5">
              <img src={r.fan_avatar_url || boroDefaultAvatar} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
              <Link
                to="/fanzone/u/$userId"
                params={{ userId: r.user_id }}
                className="min-w-0 flex-1 break-words text-xs font-semibold hover:underline"
              >
                {r.fan_alias || "Boro fan"}
              </Link>
              {renderActions(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
