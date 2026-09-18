import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Headphones, MessageSquare, Activity, Ticket, ShoppingBag, BookOpen, UserPlus, ArrowUp, ArrowDown, Trophy, KeyRound } from "lucide-react";
import heroImg from "@/assets/member-hero.jpg";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ServiceStatusPill } from "@/components/app/ServiceStatusPill";
import { SubscriptionDetailsCard } from "@/components/app/SubscriptionDetailsCard";
import { WorkingStatusBox } from "@/components/app/WorkingStatusBox";
import { useTalkChannelTotalCount } from "@/hooks/use-talk-channel-presence";

export const Route = createFileRoute("/_authenticated/_approved/home/")({
  component: WelcomePage,
});

function WelcomePage() {
  const { user, hasRole } = useAuth();
  // LOCKED: "N in chat" counter on the chatroom link. Do not change, restyle, or remove
  // without explicit authorisation. See mem://constraints/chat-counters-locked
  const chatroomCount = useTalkChannelTotalCount();
  const canManage = hasRole("admin") || hasRole("management");
  const fallbackName = (user?.email ?? "there").split("@")[0];
  const [displayName, setDisplayName] = useState<string>(fallbackName);
  const name = displayName;
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();
      const n = data?.display_name || data?.username;
      if (n) setDisplayName(n);
    })();
  }, [user?.id]);

  const goToInvite = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data?.username) {
      toast.error("Set up your profile username first");
      return;
    }
    navigate({ to: "/u/$username", params: { username: data.username }, search: { tab: "referrals" } });
  };

  const goToCredentials = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data?.username) {
      toast.error("Set up your profile username first");
      return;
    }
    navigate({ to: "/u/$username", params: { username: data.username }, search: { tab: "creds" } });
  };

  

  type CardDef = {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    to?: string;
    params?: Record<string, string>;
    onClick?: () => void;
  };

  const CARDS: Record<string, CardDef> = {
    community: { key: "community", icon: Trophy, title: "Boro Fan Zone", desc: "Join the conversation with fellow Middlesbrough supporters.", to: "/forum" },
    tickets: { key: "tickets", icon: Ticket, title: "Support tickets", desc: "Open or follow your support requests.", to: "/tickets" },
    status: { key: "status", icon: KeyRound, title: "View Your Service Login Details", desc: "View your username and password and any other revelant app login information.", onClick: goToCredentials },
    shop: { key: "shop", icon: ShoppingBag, title: "Shop", desc: "Browse plans, Purchase or renew your subscription", to: "/shop" },
    "install-guides": { key: "install-guides", icon: BookOpen, title: "Install Guides & BM App Store Install Instructions", desc: "Step-by-step setup walkthroughs, now including instructions to install our App Store.", to: "/install-guides" },
    invite: { key: "invite", icon: UserPlus, title: "Create an invite", desc: "Invite a friend and earn a referral bonus.", onClick: goToInvite },
  };

  const [order, setOrder] = useState<string[]>(Object.keys(CARDS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("home_quick_link_order")
        .select("key, sort_order")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      const known = Object.keys(CARDS);
      const fromDb = (data ?? []).map((r) => r.key).filter((k) => known.includes(k));
      const missing = known.filter((k) => !fromDb.includes(k));
      setOrder([...fromDb, ...missing]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistOrder = async (next: string[]) => {
    setSaving(true);
    const rows = next.map((key, i) => ({ key, sort_order: (i + 1) * 10, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("home_quick_link_order").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save order");
    } else {
      toast.success("Order saved");
    }
  };

  const move = (key: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      void persistOrder(next);
      return next;
    });
  };

  return (
    <main className="flex-1 min-h-0 min-w-0 w-full overflow-x-hidden overflow-y-visible md:overflow-hidden">
      {/* Hero */}
      <div className="grid min-h-dvh w-full min-w-0 grid-rows-[auto_auto] overflow-x-hidden overflow-y-visible md:h-full md:min-h-0 md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden">
      <section className="relative min-h-0 min-w-0 w-full border-b border-border p-4 xl:p-6">
        <div className="grid min-h-0 min-w-0 w-full gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] xl:gap-6">
          <div className="relative flex min-h-0 min-w-0 flex-col pb-8 lg:pb-10">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 shadow-2xl">
              <div className="grid min-h-0 flex-1 gap-5 p-3 pb-12 md:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] md:items-stretch md:p-4 md:pb-14 xl:gap-6 xl:p-5 xl:pb-16">
                <div className="relative min-h-56 min-w-0 overflow-hidden rounded-xl bg-blue-950/30 ring-1 ring-white/10 md:aspect-[16/10] md:self-center xl:aspect-[16/9]">
                  <img
                    src={heroImg}
                    alt="BM Support — community and support"
                    width={1280}
                    height={832}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/35 via-transparent to-transparent" />
                </div>

                <div className="flex min-w-0 flex-col justify-center text-white">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-sky-200/80">BM Support · Member Hub</div>
                  <h1 className="font-display text-3xl font-bold leading-tight xl:text-5xl">
                    Welcome to BM Support
                  </h1>
                  <p className="mt-3 max-w-lg text-sm text-white/95 xl:text-base">
                    Hey {name} — your all-in-one server for BM Support. Stay connected with the
                    community, manage your account and get help, all in one place.
                  </p>
                  <p className="mt-2 max-w-lg text-xs text-white/85 xl:text-sm">
                    Access community channels, view schedules, get support and explore our
                    services. Everything you need is just one click away.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10 mx-3 -mt-10 grid grid-cols-1 gap-2 sm:mx-5 sm:grid-cols-2 lg:mx-6">
              {!hasRole("moderator") && (
                <Link
                  to="/tickets"
                  className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-surface/90 px-3 py-2.5 text-xs font-medium text-foreground shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur transition hover:border-white/60 hover:bg-surface-2 xl:gap-3 xl:px-4 xl:py-3 xl:text-sm"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 xl:size-9">
                    <Headphones className="size-4 text-white" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-foreground">Expert Support</span>
                    <span className="block text-[10px] text-muted-foreground xl:text-[11px]">We're always here to help.</span>
                  </span>
                  <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60 xl:ml-2" />
                </Link>
              )}
              <ServiceStatusPill className="min-h-16 justify-center self-stretch gap-2 bg-surface/90 px-3 py-2.5 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur xl:gap-3 xl:px-4 xl:py-3 xl:text-sm [&_.status-copy]:text-[10px] xl:[&_.status-copy]:text-[11px] [&_.status-icon]:size-8 xl:[&_.status-icon]:size-9 [&_.status-dot]:ml-0 xl:[&_.status-dot]:ml-2" />
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-col items-center gap-4 lg:items-stretch">
            <WorkingStatusBox />
            <SubscriptionDetailsCard />
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="shrink-0 min-w-0 p-3 xl:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display text-lg font-semibold">Jump back in</h2>
          <Link
            to="/home/$channel"
            params={{ channel: "welcome" }}
            className="text-sm text-sky-300 hover:text-sky-200 inline-flex items-center gap-2"
          >
            Open BM Support Customer Chat-room →
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {chatroomCount} in chat
            </span>
          </Link>
        </div>
        <div className="grid min-w-0 sm:grid-cols-2 gap-2">
          {order.map((key, idx) => {
            if (hasRole("moderator") && key === "tickets") return null;
            const c = CARDS[key];
            if (!c) return null;
            const controls = canManage ? (
              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 z-10 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={idx === 0 || saving}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); move(key, -1); }}
                  className="size-6 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={idx === order.length - 1 || saving}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); move(key, 1); }}
                  className="size-6 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            ) : null;
            return (
              <div key={key} className="group relative h-full min-w-0">
                {controls}
                {c.to ? (
                  <QuickCard to={c.to} params={c.params} icon={c.icon} title={c.title} desc={c.desc} />
                ) : (
                  <QuickAction onClick={c.onClick!} icon={c.icon} title={c.title} desc={c.desc} />
                )}
              </div>
            );
            })}
        </div>
      </section>
      </div>

    </main>
  );
}

function QuickCard({
  to,
  params,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  params?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className="group w-full h-14 rounded-xl border-2 border-violet-500/40 bg-surface hover:bg-surface-2 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all px-4 py-2 flex items-center gap-3 overflow-hidden"
    >
      <span className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white shrink-0">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-sm text-foreground">{title}</span>
        <span className="block truncate text-xs text-foreground/75 mt-0.5">{desc}</span>
      </span>
    </Link>
  );
}

function QuickAction({
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full h-14 text-left rounded-xl border-2 border-violet-500/40 bg-surface hover:bg-surface-2 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all px-4 py-2 flex items-center gap-3 overflow-hidden"
    >
      <span className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white shrink-0">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-sm text-foreground">{title}</span>
        <span className="block truncate text-xs text-foreground/75 mt-0.5">{desc}</span>
      </span>
    </button>
  );
}
