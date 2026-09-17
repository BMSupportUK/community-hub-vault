import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { FanZoneNameGate } from "@/components/app/FanZoneNamePrompt";
import { FanZoneFriendRequestsBox } from "@/components/app/FanZoneFriendRequestsBox";
import AdSenseSlot from "@/components/app/AdSenseSlot";
import { Button } from "@/components/ui/button";
import bgAsset from "@/assets/boro-fan-zone-profile-bg.jpg.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/friend-requests")({
  component: FriendRequestsPage,
  head: () => ({
    meta: [
      { title: "Friend requests — Boro Fan Zone" },
      {
        name: "description",
        content: "Accept or decline Boro Fan Zone friend requests and send new requests to other Boro fans.",
      },
      { property: "og:title", content: "Friend requests — Boro Fan Zone" },
      {
        property: "og:description",
        content: "Accept or decline Boro Fan Zone friend requests and send new requests to other Boro fans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function FriendRequestsPage() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaff = hasAny(["admin", "boro_fan_zone_moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const canEnter = isStaff || info?.status === "approved";

  if (!canEnter || !user?.id) return <div className="p-6 text-center text-sm">Members only.</div>;

  return (
    <div
      className="boro-theme relative min-h-[calc(100vh-4rem)] w-full bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgAsset.url})` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,7,18,0.78) 0%, rgba(3,7,18,0.84) 55%, rgba(3,7,18,0.94) 100%)",
        }}
        aria-hidden
      />
      {/* Mobile: sticky full-screen modal header; desktop: back link below */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/15 bg-[#050b16]/95 px-4 py-3 backdrop-blur-md sm:hidden">
        <div className="flex min-w-0 items-center gap-2 text-white">
          <UserPlus className="size-4 shrink-0 text-[#E11B22]" />
          <span className="truncate font-display text-sm font-bold">Friend requests</span>
        </div>
        <button
          type="button"
          aria-label="Close friend requests"
          onClick={() => navigate({ to: "/fanzone/u/$userId", params: { userId: user.id } })}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white active:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="space-y-5 min-w-0">
            <FanZoneNameGate />
            <Button asChild variant="ghost" size="sm" className="-ml-2 hidden text-white/80 hover:text-white hover:bg-white/10 sm:inline-flex">
              <Link to="/fanzone/u/$userId" params={{ userId: user.id }}>
                <ArrowLeft className="mr-1 size-4" /> Back to my profile
              </Link>
            </Button>

            <header className="hidden rounded-2xl border border-[#E11B22]/40 bg-black/50 p-5 backdrop-blur-md sm:block sm:p-7">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#E11B22]">
                <UserPlus className="size-3.5" /> Boro Fan Zone
              </div>
              <h1 className="mt-2 font-display text-3xl font-black text-white sm:text-4xl">Friend requests</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Requests from other Boro fans, the ones you've sent, and a search box to add new friends.
              </p>
            </header>

            <div className="-mx-4 sm:mx-0">
              <FanZoneFriendRequestsBox userId={user.id} fullBleed />
            </div>
          </div>

          <aside className="hidden xl:block xl:sticky xl:top-6">
            <AdSenseSlot slot="sidebar" />
          </aside>
        </div>
      </div>
    </div>
  );
}
