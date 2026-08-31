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
    "install-guides": { key: "install-guides", icon: BookOpen, title: "Install guides", desc: "Step-by-step setup walkthroughs.", to: "/install-guides" },
    invite: { key: "invite", icon: UserPlus, title: "Create an invite", desc: "Invite a friend and earn a referral bonus.", onClick: goToInvite },
  };

  const [order, setOrder] = useState<string[]>(Object.keys(CARDS));
  const [saving, setSaving] = useState(false);
  const welcomeOnlineCount = useTalkChannelTotalCount();

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
      <section className="relative min-h-0 min-w-0 w-full overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="relative grid min-h-0 min-w-0 w-full lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)_minmax(220px,300px)] gap-4 xl:gap-6 p-4 xl:p-6 items-stretch md:h-full">
          {/* Hero image (left) */}
          <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl min-h-0 bg-blue-950/30">
            <img
              src={heroImg}
              alt="BM Support — community and support"
              width={1280}
              height={832}
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/40 via-transparent to-transparent" />
          </div>

          {/* Text (middle) */}
          <div className="flex min-w-0 flex-col justify-center text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-sky-200/80 mb-2">BM Support · Member Hub</div>
            <h1 className="font-display text-3xl xl:text-5xl font-bold leading-tight">
              Welcome to BM Support
            </h1>
            <p className="mt-3 text-sm xl:text-base text-white/95 max-w-lg">
              Hey {name} — your all-in-one server for BM Support. Stay connected with the
              community, manage your account and get help, all in one place.
            </p>
            <p className="mt-2 text-white/85 max-w-lg text-xs xl:text-sm">
              Access community channels, view schedules, get support and explore our
              services. Everything you need is just one click away.
            </p>

            <div className="mt-4 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
              {!hasRole("moderator") && (
                <Link
                  to="/tickets"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur px-3 py-2.5 text-xs font-medium text-white shadow-[0_0_24px_rgba(255,255,255,0.15)] hover:bg-white/20 hover:border-white/60 transition xl:gap-3 xl:px-4 xl:py-3 xl:text-sm"
                >
                  <span className="grid place-items-center size-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 xl:size-9">
                    <Headphones className="size-4 text-white" />
                  </span>
                  <span>
                    <span className="block text-white">Expert Support</span>
                    <span className="block text-[10px] text-sky-50/90 xl:text-[11px]">We're always here to help.</span>
                  </span>
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60 xl:ml-2" />
                </Link>
              )}
              <ServiceStatusPill className="flex-1 justify-center self-stretch gap-2 px-3 py-2.5 text-xs xl:gap-3 xl:px-4 xl:py-3 xl:text-sm [&_.status-copy]:text-[10px] xl:[&_.status-copy]:text-[11px] [&_.status-icon]:size-8 xl:[&_.status-icon]:size-9 [&_.status-dot]:ml-0 xl:[&_.status-dot]:ml-2" />
            </div>
          </div>

          {/* Working status + subscription details (right) */}
          <div className="min-h-0 flex flex-col gap-4 justify-center xl:justify-start">
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
            <span className="inline-flex items-center gap-1.5" aria-live="polite">
              <span
                className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold tabular-nums transition-colors ${
                  welcomeOnlineCount > 0
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-label={welcomeOnlineCount > 0 ? `${welcomeOnlineCount} users in chat` : "No users in chat"}
              >
                {welcomeOnlineCount}
              </span>
              <span className="text-xs font-medium">User in Chat</span>
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
