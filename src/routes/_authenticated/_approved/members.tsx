import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Users, Search, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_approved/members")({
  component: MembersPage,
});

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

interface RoleRow {
  user_id: string;
  role: string;
}

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-rose-500/20 text-rose-300 ring-rose-400/40",
  management: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-400/40",
  moderator: "bg-amber-500/20 text-amber-300 ring-amber-400/40",
  staff: "bg-sky-500/20 text-sky-300 ring-sky-400/40",
  member: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40",
  pending: "bg-zinc-500/20 text-zinc-300 ring-zinc-400/40",
  banned: "bg-red-500/20 text-red-300 ring-red-400/40",
};

function MembersPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setProfiles((ps as Profile[] | null) ?? []);
      const map: Record<string, string[]> = {};
      for (const r of (rs as RoleRow[] | null) ?? []) {
        (map[r.user_id] ||= []).push(r.role);
      }
      setRolesByUser(map);
    })();
  }, [isAdmin]);

  const STAFF_ROLES = new Set(["admin", "management", "moderator", "staff"]);
  const filtered = profiles.filter((p) => {
    const roles = rolesByUser[p.id] ?? [];
    if (roles.some((r) => STAFF_ROLES.has(r))) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.display_name ?? "").toLowerCase().includes(s) ||
      (p.username ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <main className="flex-1 overflow-y-auto">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-700 via-violet-700 to-blue-700" />
        <div className="absolute -top-20 -right-20 size-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 size-80 rounded-full bg-pink-400/20 blur-3xl" />
        <div className="relative p-6 md:p-10 flex flex-col md:flex-row md:items-end gap-6 justify-between text-white">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-fuchsia-200/80 mb-3 flex items-center gap-2">
              <Users className="size-3.5" /> BM Support · Directory
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Members Directory
            </h1>
            <p className="mt-3 text-white/80 max-w-xl">
              Meet the community.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/15 px-4 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/60">Members</div>
              <div className="font-display font-bold text-2xl">{filtered.length}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-fuchsia-400 outline-none"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-20 text-sm">
            No members found.
          </div>
        )}
        {filtered.map((p) => {
          const userRoles = rolesByUser[p.id] ?? ["member"];
          const name = p.display_name ?? p.username ?? "Unknown";
          const initial = name.slice(0, 1).toUpperCase();
          return (
            <div
              key={p.id}
              className="group rounded-2xl bg-surface border border-border hover:border-fuchsia-400/50 hover:shadow-lg hover:shadow-fuchsia-500/10 transition-all overflow-hidden flex flex-col"
            >
              <div className="h-16 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-blue-600" />
              <div className="px-4 -mt-8 pb-4 flex flex-col flex-1">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="size-16 rounded-2xl object-cover ring-4 ring-surface"
                  />
                ) : (
                  <div className="size-16 rounded-2xl ring-4 ring-surface bg-gradient-to-br from-fuchsia-500 to-violet-600 grid place-items-center text-white text-xl font-bold">
                    {initial}
                  </div>
                )}
                <div className="mt-3">
                  <Link
                    to="/u/$username"
                    params={{ username: p.username ?? p.id }}
                    className="font-semibold text-sm hover:text-fuchsia-300 transition-colors"
                  >
                    {name}
                  </Link>
                  {p.username && (
                    <div className="text-[11px] text-muted-foreground">@{p.username}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {userRoles.map((r) => (
                    <span
                      key={r}
                      className={`text-[10px] uppercase tracking-wider rounded-full ring-1 px-2 py-0.5 ${
                        ROLE_COLOR[r] ?? ROLE_COLOR.member
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
                {p.bio && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.bio}</p>
                )}

                <div className="mt-auto pt-3 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Joined {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}