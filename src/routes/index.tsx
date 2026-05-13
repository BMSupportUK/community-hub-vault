import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Shield, MessageSquare, Ticket, ShoppingBag, BookOpen, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-primary-foreground">H</div>
          <span className="font-display font-bold text-lg">Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 shadow-glow">Request access</Link>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-3xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Invite-only community
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Where the team
            <span className="block bg-gradient-primary bg-clip-text text-transparent">actually talks.</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Channels, tickets, a shop, guides, and a staff time clock — all in one place. Every new member is vetted by a moderator before they get in.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/signup" className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90">Request access</Link>
            <Link to="/login" className="px-6 py-3 rounded-lg bg-surface border border-border font-medium hover:bg-surface-2">I have an account</Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-12 text-left">
            {[
              { i: Shield, t: "Security gate", d: "Chat with a mod to gain access." },
              { i: MessageSquare, t: "Channels", d: "Realtime, role-based." },
              { i: Ticket, t: "Tickets", d: "Private support threads." },
              { i: ShoppingBag, t: "Shop", d: "In-server storefront." },
              { i: BookOpen, t: "Guides", d: "Block-based with read tracking." },
              { i: Clock, t: "Staff clock", d: "Shifts, breaks, applications." },
            ].map(({ i: Icon, t, d }) => (
              <div key={t} className="p-4 rounded-xl bg-surface border border-border">
                <Icon className="size-5 text-primary mb-2" />
                <div className="font-medium text-sm">{t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
