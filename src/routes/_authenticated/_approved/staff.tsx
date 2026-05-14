import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Search, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/_approved/staff")({
  component: StaffPage,
});

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}
interface RoleRow { user_id: string; role: string }

const ROLE_ORDER = ["admin", "management", "moderator", "staff"] as const;
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrators",
  management: "Management",
  moderator: "Moderators",
  staff: "Staff",
};

function StaffPage() {
  const [tab, setTab] = useState("welcome");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("*").order("display_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setProfiles((ps as Profile[] | null) ?? []);
      const map: Record<string, string[]> = {};
      for (const r of (rs as RoleRow[] | null) ?? []) {
        (map[r.user_id] ||= []).push(r.role);
      }
      setRolesByUser(map);
    })();
  }, []);

  const STAFF_SET = new Set<string>(ROLE_ORDER);
  const staffProfiles = profiles.filter((p) =>
    (rolesByUser[p.id] ?? []).some((r) => STAFF_SET.has(r))
  );
  const filtered = staffProfiles.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.display_name ?? "").toLowerCase().includes(s) ||
      (p.username ?? "").toLowerCase().includes(s)
    );
  });

  // Highest role per user (by ROLE_ORDER priority)
  const topRole = (uid: string): string => {
    const rs = rolesByUser[uid] ?? [];
    for (const r of ROLE_ORDER) if (rs.includes(r)) return r;
    return "staff";
  };

  const grouped: Record<string, Profile[]> = {};
  ROLE_ORDER.forEach((r) => (grouped[r] = []));
  filtered.forEach((p) => grouped[topRole(p.id)].push(p));

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#0a1530] via-[#0f2a5a] to-[#0a1530]">
      <header className="px-8 pt-8 pb-6 border-b border-blue-500/30 bg-blue-950/40 backdrop-blur flex items-center gap-3">
        <div className="size-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 grid place-items-center text-white shadow-lg shadow-blue-900/50">
          <Briefcase className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-sky-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
            Staff Directory
          </h1>
          <p className="text-blue-200/80 mt-1">The people running the show — grouped by role.</p>
        </div>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-2 max-w-md bg-blue-950/60 border border-blue-500/30">
            <TabsTrigger
              value="welcome"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-600 data-[state=active]:to-blue-700 data-[state=active]:text-white"
            >
              Welcome
            </TabsTrigger>
            <TabsTrigger
              value="staff"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-600 data-[state=active]:to-blue-700 data-[state=active]:text-white"
            >
              Staff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-sky-600/30 via-blue-600/30 to-cyan-700/30 border border-blue-500/40 p-10 shadow-[0_0_60px_-15px_rgba(59,130,246,0.5)]">
              <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-sky-200 to-cyan-200 bg-clip-text text-transparent">
                Welcome to the Staff Directory
              </h2>
              <p className="mt-3 text-lg text-blue-100/90 max-w-2xl">
                Meet the team keeping BM Support running smoothly — administrators, management,
                moderators, and staff working together.
              </p>
              <p className="mt-4 text-blue-200/70 max-w-2xl">
                Browse by role, search by name, and click any profile to learn more about the people behind the platform.
              </p>
              <button
                onClick={() => setTab("staff")}
                className="mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-medium shadow-lg shadow-blue-900/50 transition"
              >
                <Briefcase className="size-4" /> Browse staff
              </button>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-6 space-y-8">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-blue-300" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search staff…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-blue-950/50 border border-blue-500/30 text-blue-50 placeholder:text-blue-300/50 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            {ROLE_ORDER.every((r) => grouped[r].length === 0) && (
              <div className="rounded-2xl border border-dashed border-blue-500/40 p-12 text-center text-blue-200/70 bg-blue-950/30">
                No staff members found.
              </div>
            )}

            {ROLE_ORDER.map((role) => {
              const list = grouped[role];
              if (!list.length) return null;
              return (
                <section key={role}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-display text-xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent">
                      {ROLE_LABEL[role]}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-800/60 text-blue-100 border border-blue-500/30">
                      {list.length}
                    </span>
                    <div className="flex-1 h-px bg-blue-500/20" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map((p) => {
                      const name = p.display_name ?? p.username ?? "Unknown";
                      const initial = name.slice(0, 1).toUpperCase();
                      const userRoles = rolesByUser[p.id] ?? [];
                      return (
                        <div
                          key={p.id}
                          className="group rounded-2xl bg-blue-950/50 border border-blue-500/30 hover:border-sky-400/70 hover:shadow-[0_0_30px_-10px_rgba(56,189,248,0.6)] transition-all overflow-hidden flex flex-col backdrop-blur"
                        >
                          <div className="h-16 bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-600" />
                          <div className="px-4 -mt-8 pb-4 flex flex-col flex-1">
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                alt=""
                                className="size-16 rounded-2xl object-cover ring-4 ring-blue-950"
                              />
                            ) : (
                              <div className="size-16 rounded-2xl ring-4 ring-blue-950 bg-gradient-to-br from-sky-500 to-blue-700 grid place-items-center text-white text-xl font-bold">
                                {initial}
                              </div>
                            )}
                            <div className="mt-3">
                              <Link
                                to="/u/$username"
                                params={{ username: p.username ?? p.id }}
                                className="font-semibold text-sm text-blue-50 hover:text-sky-300 transition-colors"
                              >
                                {name}
                              </Link>
                              {p.username && (
                                <div className="text-[11px] text-blue-300/70">@{p.username}</div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {userRoles
                                .filter((r) => STAFF_SET.has(r))
                                .map((r) => (
                                  <span
                                    key={r}
                                    className="text-[10px] uppercase tracking-wider rounded-full ring-1 ring-sky-400/40 bg-sky-500/20 text-sky-200 px-2 py-0.5"
                                  >
                                    {r}
                                  </span>
                                ))}
                            </div>
                            {p.bio && (
                              <p className="text-xs text-blue-200/70 mt-2 line-clamp-2">{p.bio}</p>
                            )}
                            <div className="mt-auto pt-3 border-t border-blue-500/20 text-[11px] text-blue-300/70 flex items-center gap-1.5">
                              <Clock className="size-3" />
                              Joined {new Date(p.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
