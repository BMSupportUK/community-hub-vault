import { Link } from "@tanstack/react-router";
import { PORTAL_QUICK_LINKS } from "@/components/app/portal-quick-links";
import { Headphones, Star } from "lucide-react";
import heroImg from "@/assets/member-hero.jpg";
import staffHeroImg from "@/assets/staff-portal-hero.jpg";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { ServiceStatusPill } from "@/components/app/ServiceStatusPill";
import { SubscriptionDetailsCard } from "@/components/app/SubscriptionDetailsCard";
import { Nameplate } from "@/components/app/Nameplate";
import { WorkingStatusBox } from "@/components/app/WorkingStatusBox";
import { formatRoleLabel } from "@/lib/role-label";
import { Clocks } from "@/components/app/Clocks";
import { LockNowPill } from "@/components/app/ScreenLockProvider";
import { TwoFactorPill, VpnPill } from "@/components/app/TwoFactorBanner";

/** Office time, lock, 2FA and VPN pills shown beside the "Hey" greeting. */
function GreetingPills() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-1.5 shadow-lg backdrop-blur [&_span.hidden]:!inline">
      <Clocks />
      <LockNowPill />
      <TwoFactorPill />
      <VpnPill />
    </div>
  );
}

/** Portal home — staff layout for the Staff Portal, member layout for the Customer Portal. */

export function PortalHome({ staff }: { staff: boolean }) {
  const { user, hasRole, roles } = useAuth();
  const isStaffAccount = staff;
  // Highest-priority staff role, used for the greeting line under the hero image.
  const STAFF_ROLE_PRIORITY: AppRole[] = ["admin", "management", "moderator", "staff"];
  const staffRole = STAFF_ROLE_PRIORITY.find((r) => roles.includes(r));
  const staffRoleLabel = formatRoleLabel(staffRole);
  const fallbackName = (user?.email ?? "there").split("@")[0];
  const [displayName, setDisplayName] = useState<string>(fallbackName);
  const [nameplateId, setNameplateId] = useState<string | null>(null);
  const [isStaffShiftActive, setIsStaffShiftActive] = useState(false);
  const name = displayName;

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, username, equipped_nameplate_id")
        .eq("id", user.id)
        .maybeSingle();
      const n = data?.display_name || data?.username;
      if (n) setDisplayName(n);
      setNameplateId(data?.equipped_nameplate_id ?? null);
    })();
  }, [user?.id]);

  return (
    <main className="flex-1 min-h-0 min-w-0 w-full overflow-x-hidden overflow-y-visible md:overflow-y-auto">
      {/* Hero */}
      <div className="grid min-h-dvh w-full min-w-0 grid-rows-[1fr_auto] overflow-x-hidden overflow-y-visible md:h-full md:min-h-0">
      <section className="relative min-h-0 min-w-0 w-full border-b border-border p-4 xl:p-6">
        <div className="grid min-h-0 min-w-0 w-full grid-cols-1 gap-4 md:h-full lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] xl:gap-6">
          <div className="relative flex min-h-0 min-w-0 flex-col pb-8 lg:pb-10">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 shadow-2xl">
              <div className="grid min-h-0 flex-1 gap-4 p-4 pb-14 lg:p-5 lg:pb-14 xl:gap-6 xl:p-6 xl:pb-14">
                <div className="order-1 flex min-w-0 flex-col gap-3 self-stretch text-white">
                  <div className="relative min-h-[260px] w-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-blue-950/30 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] ring-2 ring-white/25">
                    <div className="absolute inset-0">
                      <img
                        src={isStaffAccount ? staffHeroImg : heroImg}
                        alt={isStaffAccount ? "BM Support staff working at office desks while colleagues walk between them" : "BM Support — community and support"}
                        width={1920}
                        height={isStaffAccount ? 832 : 1080}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-violet-950/70 via-fuchsia-900/10 to-transparent" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="relative z-10 mx-3 -mt-10 grid grid-cols-1 gap-2 sm:mx-5 sm:grid-cols-2 lg:mx-6">
              {!hasRole("moderator") && (
                <div
                  className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-surface/90 px-3 py-2.5 text-xs font-medium text-foreground shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur xl:gap-3 xl:px-4 xl:py-3 xl:text-sm"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 xl:size-9">
                    <Headphones className="size-4 text-white" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-foreground">Expert Support</span>
                    <span className="block text-[10px] text-muted-foreground xl:text-[11px]">We're always here to help.</span>
                  </span>
                  <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60 xl:ml-2" />
                </div>
              )}
              <ServiceStatusPill className="min-h-16 justify-center self-stretch gap-2 bg-surface/90 px-3 py-2.5 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur xl:gap-3 xl:px-4 xl:py-3 xl:text-sm [&_.status-copy]:text-[10px] xl:[&_.status-copy]:text-[11px] [&_.status-icon]:size-8 xl:[&_.status-icon]:size-9 [&_.status-dot]:ml-0 xl:[&_.status-dot]:ml-2" />
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-col items-stretch gap-4">
                {/* Right column — same order for both portals: icons, Hey + nameplate, welcome, then status/subscription. */}
                <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-white/15 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 p-4 text-white shadow-2xl">
                  <GreetingPills />
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1">
                    <span className="text-base font-bold text-amber-200 drop-shadow">Hey</span>
                    <div className="relative h-8 w-[151px] max-w-full shrink-0 overflow-hidden rounded-lg">
                      <Nameplate
                        id={nameplateId}
                        className="absolute inset-0"
                        fallbackStyle={{ background: "linear-gradient(to bottom right, hsl(var(--primary)/0.3), hsl(330 80% 60% / 0.2), hsl(220 80% 60% / 0.2))" }}
                      />
                      <div className="relative flex h-full items-center px-2.5">
                        <span className="truncate font-display text-sm font-semibold text-white">{name}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                      {isStaffAccount ? (staffRoleLabel ?? "Staff") : "Member"}
                    </span>
                  </div>
                  <div className="px-1">
                    <h1 className="break-words font-display text-xl font-extrabold leading-tight lg:text-2xl bg-gradient-to-r from-white via-amber-100 to-pink-200 bg-clip-text text-transparent drop-shadow">
                      {isStaffAccount ? "Welcome to The Staff Portal" : "Welcome to The Customer Portal"}
                    </h1>
                    <p className="mt-2 text-xs font-medium text-white/90 lg:text-sm">
                      <Star className="mr-1 inline-block size-3.5 shrink-0 -translate-y-px text-amber-200 align-middle lg:size-4" />
                      <span>
                        {!isStaffAccount
                          ? "Manage your account, orders and logins, and get help — all in one place."
                          : isStaffShiftActive
                            ? `Have a great shift, ${name} — thanks for being on. We've got your back if anything comes up.`
                            : `See you on your next shift, ${name} — enjoy your time away.`}
                      </span>
                      <Star className="ml-1 inline-block size-3.5 shrink-0 -translate-y-px text-amber-200 align-middle lg:size-4" />
                    </p>
                  </div>
                  {isStaffAccount ? (
                    <WorkingStatusBox compact onShiftStatusChange={setIsStaffShiftActive} />
                  ) : (
                    <SubscriptionDetailsCard compact embedded />
                  )}
                </div>
            </div>
          </div>
      </section>
      <nav aria-label="More from BM Support" className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-4 xl:px-6 xl:pb-6">
        {PORTAL_QUICK_LINKS.map(({ to, label, blurb, Icon }) => (
          <Link key={to} to={to} className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 p-3 text-white shadow-xl transition-transform hover:-translate-y-0.5 xl:p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Icon className="size-5" /></span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold">{label}</span>
              <span className="block truncate text-[11px] text-white/80">{blurb}</span>
            </span>
          </Link>
        ))}
      </nav>
      </div>

    </main>
  );
}
