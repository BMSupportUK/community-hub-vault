import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronDown, Shield, Clock, MapPin, Users } from "lucide-react";

export const Route = createFileRoute("/packages")({
  component: PackagesPage,
  head: () => ({
    meta: [
      { title: "Support Packages Middlesbrough UK | BM Support" },
      {
        name: "description",
        content:
          "Digital access support packages in Middlesbrough, UK. Flexible tiers, local expert help, and secure account access. Sign up to view full pricing.",
      },
      { property: "og:title", content: "Support Packages Middlesbrough UK | BM Support" },
      {
        property: "og:description",
        content:
          "Local digital access support packages tailored for Middlesbrough and the wider UK. Sign up to unlock full pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { rel: "canonical", href: "https://bmsupport.uk/packages" },
    ],
  }),
});

const tiers = [
  {
    name: "Starter",
    tagline: "For individuals trying our support out",
    features: [
      "Single account access",
      "Standard local support hours",
      "Email assistance",
      "Getting-started guidance",
    ],
  },
  {
    name: "Standard",
    tagline: "Our most popular package",
    features: [
      "Multi-device household access",
      "Priority support response",
      "Setup help by a Middlesbrough-based agent",
      "Ongoing account maintenance",
    ],
    featured: true,
  },
  {
    name: "Premium",
    tagline: "Full-service for power users",
    features: [
      "Highest access tier available",
      "Fastest support response",
      "Dedicated local point of contact",
      "Advanced configuration & tuning",
    ],
  },
];

const faqs = [
  {
    q: "Where are you based?",
    a: "We're based in Middlesbrough and serve customers across the North East and the wider UK.",
  },
  {
    q: "Why aren't prices shown on this page?",
    a: "Our packages are tailored to each customer's setup. Sign up for a free account to view full pricing inside your dashboard, or contact us for a personalised quote.",
  },
  {
    q: "What is included in a support package?",
    a: "Each package bundles digital access with hands-on UK-based support — setup help, ongoing assistance, and account management from a real person.",
  },
  {
    q: "Do you offer support outside Middlesbrough?",
    a: "Yes. While we're proudly Middlesbrough-based, we support customers right across the UK remotely.",
  },
  {
    q: "How do I get started?",
    a: "Request access via the sign-up page. Once approved, you'll see all available packages and pricing inside your account.",
  },
  {
    q: "Is my account secure?",
    a: "Yes. Accounts use secure authentication, encrypted storage, and role-based access controls.",
  },
  {
    q: "Can I upgrade my package later?",
    a: "Absolutely. You can move between Starter, Standard, and Premium at any time from inside your account.",
  },
  {
    q: "Do you offer business or multi-user packages?",
    a: "Yes. The Premium tier supports advanced multi-user setups. Contact us to discuss specific business requirements.",
  },
  {
    q: "How quickly will I hear back if I contact support?",
    a: "Response times vary by tier — Standard and Premium customers receive priority handling during UK business hours.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major payment methods. Crypto (USDT) is also available for those who prefer it.",
  },
];

function PackagesPage() {
  const [open, setOpen] = useState<number | null>(0);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "BM Support — Digital Access Support Packages",
    provider: {
      "@type": "LocalBusiness",
      name: "BM Support",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Middlesbrough",
        addressCountry: "UK",
      },
      url: "https://bmsupport.uk",
    },
    areaServed: { "@type": "Place", name: "Middlesbrough, United Kingdom" },
    serviceType: "Digital access support package",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Contact us</Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 transition-all">Request access</Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-16 md:py-24 text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted-foreground mb-6">
            <MapPin className="size-3" /> Middlesbrough, United Kingdom
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Support Packages in <span className="bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">Middlesbrough, UK</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Flexible digital access support packages backed by a real, locally based team. Pick the tier that fits — sign up to see full pricing inside your account.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/signup" className="px-5 py-3 rounded-md bg-red-600 text-white hover:bg-red-500 font-medium">Sign up to see prices</Link>
            <Link to="/contact" className="px-5 py-3 rounded-md border border-border hover:bg-muted font-medium">Contact us</Link>
          </div>
        </section>

        {/* Tiers */}
        <section className="px-6 pb-16 max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                t.featured
                  ? "border-red-500/60 bg-gradient-to-b from-red-950/30 to-transparent shadow-[0_0_40px_rgba(220,38,38,0.2)]"
                  : "border-border bg-card"
              }`}
            >
              {t.featured && (
                <div className="text-xs uppercase tracking-wide text-red-400 font-semibold mb-2">Most popular</div>
              )}
              <h3 className="font-display text-2xl font-bold">{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-6">{t.tagline}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`text-center px-4 py-2.5 rounded-md font-medium ${
                  t.featured
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "border border-border hover:bg-muted"
                }`}
              >
                Sign up to see pricing
              </Link>
            </div>
          ))}
        </section>

        {/* Trust strip */}
        <section className="px-6 py-16 bg-muted/30 border-y border-border">
          <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8 text-center">
            {[
              { icon: MapPin, title: "Locally based", body: "Middlesbrough team, UK-wide service." },
              { icon: Shield, title: "Secure access", body: "Encrypted accounts and role-based controls." },
              { icon: Clock, title: "Fast response", body: "Priority handling on Standard & Premium." },
              { icon: Users, title: "Real humans", body: "Talk to people, not bots." },
            ].map((item) => (
              <div key={item.title}>
                <item.icon className="size-6 mx-auto mb-3 text-red-500" />
                <div className="font-semibold mb-1">{item.title}</div>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="px-6 py-16 max-w-3xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-border rounded-lg bg-card">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left"
                >
                  <span className="font-medium">{f.q}</span>
                  <ChevronDown className={`size-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                {open === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-20 text-center max-w-3xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-8">Request access to view full pricing and choose the package that fits.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/signup" className="px-6 py-3 rounded-md bg-red-600 text-white hover:bg-red-500 font-medium">Request access</Link>
            <Link to="/contact" className="px-6 py-3 rounded-md border border-border hover:bg-muted font-medium">Contact us</Link>
          </div>
        </section>
      </main>

      <footer className="px-8 py-6 border-t border-border text-center text-xs text-muted-foreground">
        BM Support — Middlesbrough, UK
      </footer>
    </div>
  );
}