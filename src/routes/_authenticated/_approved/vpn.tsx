import { createFileRoute } from "@tanstack/react-router";
import { Shield, Lock, Eye, Globe2, Wifi, Zap, CheckCircle2, ExternalLink } from "lucide-react";
import protonBanner from "@/assets/proton-vpn-banner.jpg";

const PROTON_REF_URL = "https://pr.tn/ref/W8YWYK64";

export const Route = createFileRoute("/_authenticated/_approved/vpn")({
  head: () => ({
    meta: [
      { title: "VPN Guide — BM Support" },
      { name: "description", content: "What a VPN is and the benefits of using one when streaming." },
    ],
  }),
  component: VpnPage,
});

function VpnPage() {
  return (
    <div className="flex-1 flex min-w-0">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-8">
          {/* Hero */}
          <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-surface-2 to-background p-8 lg:p-12">
            <div className="absolute -top-16 -right-16 size-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary-glow text-xs font-medium mb-4">
                <Shield className="size-3.5" /> Privacy & Streaming
              </div>
              <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight">
                Stream smarter with a VPN
              </h1>
              <p className="mt-4 text-muted-foreground text-base lg:text-lg max-w-2xl">
                A VPN keeps your connection private, unlocks more content, and stops your internet
                provider from throttling your streams. Here's everything you need to know.
              </p>
            </div>
          </header>

          {/* What is a VPN */}
          <section className="rounded-2xl border border-border bg-card p-6 lg:p-8">
            <h2 className="font-display text-2xl font-bold flex items-center gap-2">
              <Lock className="size-5 text-primary-glow" /> What is a VPN?
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              VPN stands for <span className="text-foreground font-medium">Virtual Private Network</span>.
              It creates an encrypted tunnel between your device and a server somewhere else in the world.
              Everything you send and receive travels through that tunnel — so your internet provider,
              network admin, or anyone snooping on public Wi-Fi only sees scrambled data, not what you're
              actually doing.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              The website or streaming service you connect to sees the VPN server's location instead of
              your real one. That's what makes it possible to appear as if you're browsing from another
              country.
            </p>
          </section>

          {/* Benefits for streaming */}
          <section>
            <h2 className="font-display text-2xl font-bold mb-4">Benefits when streaming</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {BENEFITS.map((b) => (
                <div key={b.title} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                  <div className="size-10 rounded-xl bg-primary/15 text-primary-glow grid place-items-center mb-3">
                    <b.icon className="size-5" />
                  </div>
                  <h3 className="font-semibold text-base">{b.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What to look for */}
          <section className="rounded-2xl border border-border bg-card p-6 lg:p-8">
            <h2 className="font-display text-2xl font-bold">What to look for in a streaming VPN</h2>
            <ul className="mt-4 space-y-3">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="size-5 text-primary-glow shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Mobile banner (visible only when sidebar hidden) */}
          <div className="xl:hidden">
            <ProtonBanner />
          </div>
        </div>
      </main>

      {/* Right sidebar */}
      <aside className="hidden xl:flex w-[340px] shrink-0 border-l border-border bg-rail/40 p-5 sticky top-0 self-start h-[calc(100vh-3rem)] overflow-y-auto">
        <ProtonBanner />
      </aside>
    </div>
  );
}

const BENEFITS = [
  { icon: Eye, title: "Stay private", desc: "Your ISP can't see which sites or services you're streaming from — only encrypted traffic." },
  { icon: Zap, title: "Beat ISP throttling", desc: "Some providers slow down streaming traffic. A VPN hides what you're doing, so speeds stay consistent." },
  { icon: Globe2, title: "Unlock more content", desc: "Connect through servers in other countries to access libraries that aren't available in your region." },
  { icon: Wifi, title: "Safe on public Wi-Fi", desc: "Cafés, hotels, and airports are easy targets. A VPN encrypts everything so your accounts stay yours." },
  { icon: Shield, title: "Stop tracking", desc: "Trackers and advertisers can't tie activity back to your real IP address." },
  { icon: Lock, title: "Protect your devices", desc: "One subscription covers your phone, TV box, laptop, and Fire Stick — all encrypted." },
];

const CHECKLIST = [
  "A strict no-logs policy (independently audited).",
  "Fast servers in the countries whose content you want.",
  "Support for routers, Fire Stick, Android TV, iOS and Android.",
  "Unlimited bandwidth — streaming eats data.",
  "Reliable kill switch so your real IP never leaks.",
];

function ProtonBanner() {
  return (
    <a
      href={PROTON_REF_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group relative block w-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-b from-[#1a0f3a] via-[#221049] to-[#0d0820] shadow-glow hover:shadow-[0_0_40px_rgba(167,139,250,0.4)] transition-all"
    >
      <div className="relative aspect-[3/4] w-full">
        <img
          src={protonBanner}
          alt="Proton VPN promotion"
          loading="lazy"
          width={512}
          height={768}
          className="absolute inset-0 size-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-[10px] font-semibold text-white tracking-wider uppercase mb-3">
            <Shield className="size-3" /> Recommended
          </div>
          <h3 className="font-display text-xl font-bold text-white leading-tight">
            Proton VPN
          </h3>
          <p className="text-xs text-white/80 mt-1.5 leading-relaxed">
            Swiss-based, audited no-logs, fast streaming servers worldwide.
          </p>
          <div className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#1a0f3a] text-sm font-semibold group-hover:bg-primary-glow group-hover:text-primary-foreground transition-colors">
            Get the offer <ExternalLink className="size-4" />
          </div>
          <p className="text-[10px] text-white/50 mt-2.5 text-center">
            Affiliate link — supports BM Support at no extra cost to you.
          </p>
        </div>
      </div>
    </a>
  );
}