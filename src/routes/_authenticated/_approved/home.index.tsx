import { createFileRoute, Link } from "@tanstack/react-router";
import { Headphones, Hash, MessageSquare, Activity, Ticket, ShoppingBag, BookOpen } from "lucide-react";
import heroImg from "@/assets/welcome-hero.jpg";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/home/")({
  component: WelcomePage,
});

function WelcomePage() {
  const { user } = useAuth();
  const name = (user?.email ?? "there").split("@")[0];

  return (
    <main className="flex-1 overflow-y-auto">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="relative grid md:grid-cols-2 gap-6 p-6 md:p-10">
          <div className="flex flex-col justify-center text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-sky-200/80 mb-3">BM Support · Member Hub</div>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Welcome to BM Support
            </h1>
            <p className="mt-4 text-white/95 max-w-lg">
              Hey {name} — your all-in-one server for BM Support. Stay connected with the
              community, manage your account and get help, all in one place.
            </p>
            <p className="mt-3 text-white/85 max-w-lg text-sm">
              Access community channels, view schedules, get support and explore our
              services. Everything you need is just one click away.
            </p>

            <Link
              to="/tickets"
              className="mt-6 inline-flex items-center gap-3 self-start rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur px-4 py-3 text-sm font-medium text-white shadow-[0_0_24px_rgba(255,255,255,0.15)] hover:bg-white/20 hover:border-white/60 transition"
            >
              <span className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600">
                <Headphones className="size-4 text-white" />
              </span>
              <span>
                <span className="block text-white">Expert Support</span>
                <span className="block text-[11px] text-sky-50/90">We're always here to help.</span>
              </span>
              <span className="ml-2 size-2 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60" />
            </Link>
          </div>

          <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl">
            <img
              src={heroImg}
              alt="BM Support — community and support"
              width={1280}
              height={832}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/40 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="p-6 md:p-10 max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Jump back in</h2>
          <Link to="/home/$channel" params={{ channel: "welcome" }} className="text-sm text-sky-300 hover:text-sky-200">
            Open channels →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickCard to="/home/$channel" params={{ channel: "welcome" }} icon={MessageSquare} title="Community channels" desc="Chat with members and staff in real time." />
          <QuickCard to="/tickets" icon={Ticket} title="Support tickets" desc="Open or follow your support requests." />
          <QuickCard to="/status" icon={Activity} title="System status" desc="Live infrastructure and incident updates." />
          <QuickCard to="/shop" icon={ShoppingBag} title="Shop" desc="Browse plans, add-ons and gear." />
          <QuickCard to="/install-guides" icon={BookOpen} title="Install guides" desc="Step-by-step setup walkthroughs." />
          <QuickCard to="/home/$channel" params={{ channel: "announcements" }} icon={Hash} title="Announcements" desc="Latest news from the BM Support team." />
        </div>
      </section>
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
      className="group rounded-xl border-2 border-violet-500/40 bg-surface hover:bg-surface-2 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all p-4 flex items-start gap-3"
    >
      <span className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white shrink-0">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm text-foreground">{title}</span>
        <span className="block text-xs text-foreground/75 mt-0.5">{desc}</span>
      </span>
    </Link>
  );
}