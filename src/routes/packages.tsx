import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Shield, Clock, MapPin, Users, Pencil, Plus, Trash2, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/packages")({
  component: PackagesPage,
  head: () => ({
    meta: [
      { title: "Support Packages Middlesbrough UK | BM Support" },
      {
        name: "description",
        content:
          "Digital access support packages in Middlesbrough, UK and overseas. Flexible tiers, local expert help, and secure account access. Sign up to view full pricing.",
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

interface Tier {
  id: string;
  name: string;
  tagline: string;
  features: string[];
  featured: boolean;
  sort_order: number;
}

function PackagesPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("packages_tiers")
      .select("id, name, tagline, features, featured, sort_order")
      .order("sort_order");
    setTiers((data ?? []) as Tier[]);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data ?? []).map((r) => r.role);
      setCanEdit(roles.includes("admin") || roles.includes("management"));
    })();
  }, []);

  const saveTier = async () => {
    if (!editing) return;
    setSaving(true);
    const payload = {
      name: editing.name,
      tagline: editing.tagline,
      features: editing.features.filter((f) => f.trim().length > 0),
      featured: editing.featured,
      sort_order: editing.sort_order,
    };
    if (editing.id === "new") {
      await supabase.from("packages_tiers").insert(payload);
    } else {
      await supabase.from("packages_tiers").update(payload).eq("id", editing.id);
    }
    setEditing(null);
    setSaving(false);
    load();
  };

  const deleteTier = async (id: string) => {
    if (!confirm("Delete this tier?")) return;
    await supabase.from("packages_tiers").delete().eq("id", id);
    load();
  };

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />

      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Contact us</Link>
          <Link to="/faq" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">FAQ</Link>
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
        {canEdit && (
          <div className="max-w-6xl mx-auto px-6 mb-4 flex justify-end">
            <button
              onClick={() =>
                setEditing({
                  id: "new",
                  name: "",
                  tagline: "",
                  features: [""],
                  featured: false,
                  sort_order: (tiers.at(-1)?.sort_order ?? 0) + 1,
                })
              }
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-muted"
            >
              <Plus className="size-4" /> Add tier
            </button>
          </div>
        )}
        <section className="px-6 pb-16 max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                t.featured
                  ? "border-red-500/60 bg-gradient-to-b from-red-950/30 to-transparent shadow-[0_0_40px_rgba(220,38,38,0.2)]"
                  : "border-border bg-card"
              }`}
            >
              {canEdit && (
                <div className="absolute top-3 right-3 flex gap-1">
                  <button onClick={() => setEditing(t)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted" title="Edit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => deleteTier(t.id)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted text-red-500" title="Delete">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
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

        {/* FAQ link */}
        <section className="px-6 py-12 text-center max-w-3xl mx-auto">
          <h2 className="font-display text-2xl font-bold mb-2">Got questions?</h2>
          <p className="text-muted-foreground mb-6">Read our frequently asked questions.</p>
          <Link to="/faq" className="px-5 py-3 rounded-md border border-border hover:bg-muted font-medium inline-block">View FAQ</Link>
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

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">{editing.id === "new" ? "Add tier" : "Edit tier"}</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="size-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tagline</label>
                <input value={editing.tagline} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Features</label>
                <div className="space-y-2 mt-1">
                  {editing.features.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={f}
                        onChange={(e) => {
                          const next = [...editing.features];
                          next[i] = e.target.value;
                          setEditing({ ...editing, features: next });
                        }}
                        className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm" />
                      <button
                        onClick={() => setEditing({ ...editing, features: editing.features.filter((_, idx) => idx !== i) })}
                        className="p-2 rounded-md border border-border hover:bg-muted text-red-500"
                      ><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, features: [...editing.features, ""] })}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted">
                    <Plus className="size-3" /> Add feature
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.featured}
                    onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} />
                  Featured (most popular)
                </label>
                <label className="flex items-center gap-2 text-sm ml-auto">
                  Sort
                  <input type="number" value={editing.sort_order}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                    className="w-16 px-2 py-1 rounded bg-background border border-border" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border hover:bg-muted">Cancel</button>
              <button onClick={saveTier} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                <Save className="size-4" /> {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}