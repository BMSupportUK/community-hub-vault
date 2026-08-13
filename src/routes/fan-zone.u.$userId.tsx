import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Award, FileText, Heart, Lock, MessageSquare, Quote, ThumbsUp, Users } from "lucide-react";
import { getPublicFanProfile } from "@/lib/fan-zone-public.functions";
import { Button } from "@/components/ui/button";
import boroDefaultAvatar from "@/assets/boro-default-avatar.png";
import { FanZoneShell } from "./fan-zone";
import { FanRoleBadge } from "@/components/app/FanRoleBadge";
import { RelativeTime } from "@/components/app/RelativeTime";

export const Route = createFileRoute("/fan-zone/u/$userId")({
  loader: ({ params }) => getPublicFanProfile({ data: { userId: params.userId } }),
  staleTime: 30_000,
  errorComponent: () => (
    <FanZoneShell>
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
        Couldn't load this Boro Fan Zone profile.
      </div>
    </FanZoneShell>
  ),
  notFoundComponent: () => (
    <FanZoneShell>
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
        Profile not found.
      </div>
    </FanZoneShell>
  ),
  head: () => ({
    meta: [
      { title: "Boro Fan Zone member profile | BM Support" },
      { name: "description", content: "View a Boro Fan Zone member profile: fan stats, favourite player and matchday memories." },
      { property: "og:title", content: "Boro Fan Zone member profile" },
      { property: "og:description", content: "Fan stats, favourite player and matchday memories from the Boro Fan Zone." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicFanProfilePage,
});

function PublicFanProfilePage() {
  const p = Route.useLoaderData();

  return (
    <FanZoneShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-white/80 hover:text-white">
        <Link to="/fan-zone"><ArrowLeft className="size-4 mr-1" /> Back to Fan Zone</Link>
      </Button>

      {!p ? (
        <div className="rounded-2xl border border-white/15 bg-black/70 p-10 text-center text-sm text-white/70">
          This member's fan zone profile is not available.
        </div>
      ) : p.is_private ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-white/15 bg-black/70 p-10 text-center text-white/80 backdrop-blur-md">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-white/10">
            <Lock className="size-5 text-amber-300" />
          </div>
          <h1 className="font-display mb-2 text-xl font-bold text-white">This profile is private</h1>
          <p className="text-sm text-white/70">
            {p.fan_alias} has chosen to keep their profile private.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E11B22]/45 bg-black/70 text-white shadow-2xl backdrop-blur-md">
            <div className="bg-gradient-to-br from-[#E11B22] to-[#8B0F14] px-6 py-8">
              <div className="flex items-center gap-4">
                <img
                  src={p.fan_avatar_url || boroDefaultAvatar}
                  alt={`${p.fan_alias} avatar`}
                  className="size-20 rounded-full object-cover ring-4 ring-white/20"
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Boro Fan Zone</div>
                  <h1 className="font-display truncate text-2xl font-black drop-shadow sm:text-3xl">{p.fan_alias}</h1>
                  {p.staff_role && (
                    <div className="mt-1.5">
                      <FanRoleBadge role={p.staff_role} />
                    </div>
                  )}
                  <div className="mt-1 text-xs opacity-80">
                    {p.joined_at
                      ? `Member since ${new Date(p.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
                      : "Boro Fan Zone member"}
                    {p.supporter_since ? <> · Boro fan since <span className="font-semibold">{p.supporter_since}</span></> : null}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-medium text-white/90">
                    <Clock className="size-3" />
                    Last active <RelativeTime iso={p.last_seen_at} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              {p.bio && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">Bio</div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.bio}</p>
                </div>
              )}
              {p.fav_player && (
                <div className="flex items-start gap-2">
                  <Heart className="mt-0.5 size-4 shrink-0 text-[#E11B22]" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Favourite player</div>
                    <p className="text-sm font-medium">{p.fav_player}</p>
                  </div>
                </div>
              )}
              {p.matchday_memory && (
                <div className="flex items-start gap-2">
                  <Quote className="mt-0.5 size-4 shrink-0 text-[#E11B22]" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Matchday memory</div>
                    <p className="text-sm italic">"{p.matchday_memory}"</p>
                  </div>
                </div>
              )}
              {!p.bio && !p.fav_player && !p.matchday_memory && (
                <p className="text-sm italic text-white/60">No profile info yet.</p>
              )}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
                Join the Boro Fan Zone to message members, add friends and post in the forums.
              </div>
            </div>
          </div>

          <aside className="space-y-4 self-start lg:sticky lg:top-6">
            <div className="rounded-2xl border border-[#E11B22]/40 bg-black/55 p-5 text-white shadow-2xl backdrop-blur-md">
              <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold">
                <Award className="size-4 text-[#E11B22]" />Fan stats
              </h2>
              <div className="space-y-2">
                <StatRow icon={FileText} label="Topics started" value={p.stats?.topics ?? 0} />
                <StatRow icon={MessageSquare} label="Forum posts" value={p.stats?.posts ?? 0} />
                <StatRow icon={Users} label="Friends" value={p.stats?.friends ?? 0} />
                <StatRow icon={ThumbsUp} label="Reactions received" value={p.stats?.reactions ?? 0} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </FanZoneShell>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <Icon className="size-4 text-[#E11B22]" />
      <div className="flex-1 text-xs text-white/70">{label}</div>
      <div className="font-display text-lg font-black tabular-nums">{value}</div>
    </div>
  );
}
