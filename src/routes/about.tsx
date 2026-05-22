import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Clock, Pencil, Save, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About BM Support | Middlesbrough UK & Overseas" },
      {
        name: "description",
        content:
          "Learn about BM Support — a Middlesbrough-based team serving customers across the UK and overseas. See our opening hours and location.",
      },
      { property: "og:title", content: "About BM Support | Middlesbrough UK & Overseas" },
      {
        property: "og:description",
        content:
          "Middlesbrough-based team serving the UK and overseas. Opening hours and location.",
      },
      { property: "og:type", content: "website" },
      { rel: "canonical", href: "https://bmsupport.uk/about" },
    ],
  }),
});

interface Section {
  id: string;
  section_key: string;
  heading: string;
  body: string;
  sort_order: number;
}

interface Hour {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string) {
  // "09:00:00" -> "9:00 AM"
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = mStr;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function AboutPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [hours, setHours] = useState<Hour[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: secs }, { data: hrs }] = await Promise.all([
      supabase
        .from("about_us_content")
        .select("id, section_key, heading, body, sort_order")
        .order("sort_order"),
      supabase
        .from("business_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week"),
    ]);
    setSections((secs ?? []) as Section[]);
    setHours((hrs ?? []) as Hour[]);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r) => r.role);
      setCanEdit(roles.includes("admin") || roles.includes("management"));
    })();
  }, []);

  const saveSection = async () => {
    if (!editing) return;
    setSaving(true);
    const payload = {
      section_key: editing.section_key,
      heading: editing.heading,
      body: editing.body,
      sort_order: editing.sort_order,
    };
    if (editing.id === "new") {
      await supabase.from("about_us_content").insert(payload);
    } else {
      await supabase.from("about_us_content").update(payload).eq("id", editing.id);
    }
    setEditing(null);
    setSaving(false);
    load();
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Delete this section?")) return;
    await supabase.from("about_us_content").delete().eq("id", id);
    load();
  };

  // Reorder Mon–Sun for display
  const orderedHours = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => hours.find((h) => h.day_of_week === d))
    .filter(Boolean) as Hour[];

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "BM Support",
    url: "https://bmsupport.uk",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Middlesbrough",
      addressCountry: "UK",
    },
    areaServed: [
      { "@type": "Place", name: "Middlesbrough, United Kingdom" },
      { "@type": "Place", name: "United Kingdom" },
      { "@type": "Place", name: "Overseas" },
    ],
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />

      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/packages" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Packages</Link>
          <Link to="/faq" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">FAQ</Link>
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Contact us</Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 transition-all">Request access</Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 py-16 md:py-20 max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted-foreground mb-6">
            <MapPin className="size-3" /> Middlesbrough, UK & Overseas
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-4">
            About <span className="bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">BM Support</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Who we are and where to find us.
          </p>
        </section>

        <section className="px-6 pb-16 max-w-6xl mx-auto grid lg:grid-cols-2 gap-10">
          {/* Left: content */}
          <div className="space-y-8">
            {canEdit && (
              <button
                onClick={() =>
                  setEditing({
                    id: "new",
                    section_key: `section_${Date.now()}`,
                    heading: "",
                    body: "",
                    sort_order: (sections.at(-1)?.sort_order ?? 0) + 1,
                  })
                }
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-muted"
              >
                <Plus className="size-4" /> Add section
              </button>
            )}
            {sections.map((s) => (
              <div key={s.id} className="relative rounded-2xl border border-border bg-card p-6">
                {canEdit && (
                  <div className="absolute top-3 right-3 flex gap-1">
                    <button onClick={() => setEditing(s)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted" title="Edit">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => deleteSection(s.id)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted text-red-500" title="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
                <h2 className="font-display text-2xl font-bold mb-3 pr-16">{s.heading}</h2>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Right: map + hours */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <MapPin className="size-4 text-red-500" />
                <h2 className="font-display font-semibold">Find us in Middlesbrough</h2>
              </div>
              <div className="aspect-square w-full">
                <iframe
                  title="BM Support — Middlesbrough location"
                  src="https://www.openstreetmap.org/export/embed.html?bbox=-1.2697%2C54.5475%2C-1.1897%2C54.5875&amp;layer=mapnik&amp;marker=54.5742%2C-1.2350"
                  className="w-full h-full border-0"
                  loading="lazy"
                />
              </div>
              <div className="px-5 py-3 text-xs text-muted-foreground border-t border-border flex justify-between">
                <span>Middlesbrough, UK</span>
                <a
                  href="https://www.openstreetmap.org/?mlat=54.5742&mlon=-1.2350#map=14/54.5742/-1.2350"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground"
                >
                  View larger map →
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-red-500" />
                  <h2 className="font-display font-semibold">Opening hours</h2>
                </div>
                {canEdit && (
                  <Link to="/admin-business-hours" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <Pencil className="size-3" /> Edit
                  </Link>
                )}
              </div>
              <ul className="divide-y divide-border">
                {orderedHours.map((h) => (
                  <li key={h.day_of_week} className="px-5 py-3 flex justify-between text-sm">
                    <span className="font-medium">{DAY_NAMES[h.day_of_week]}</span>
                    <span className="text-muted-foreground">
                      {h.is_closed ? "Closed" : `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`}
                    </span>
                  </li>
                ))}
                {orderedHours.length === 0 && (
                  <li className="px-5 py-4 text-sm text-muted-foreground">Hours coming soon.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-6 py-16 text-center max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-8">Request access to view full pricing and choose the package that fits.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/signup" className="px-6 py-3 rounded-md bg-red-600 text-white hover:bg-red-500 font-medium">Request access</Link>
            <Link to="/packages" className="px-6 py-3 rounded-md border border-border hover:bg-muted font-medium">See packages</Link>
          </div>
        </section>
      </main>

      <footer className="px-8 py-6 border-t border-border text-center text-xs text-muted-foreground">
        BM Support — Middlesbrough, UK & Overseas
      </footer>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">{editing.id === "new" ? "Add section" : "Edit section"}</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="size-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Heading</label>
                <input
                  value={editing.heading}
                  onChange={(e) => setEditing({ ...editing, heading: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <textarea
                  value={editing.body}
                  rows={8}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm ml-auto">
                  Sort
                  <input
                    type="number"
                    value={editing.sort_order}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                    className="w-16 px-2 py-1 rounded bg-background border border-border"
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border hover:bg-muted">Cancel</button>
              <button onClick={saveSection} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                <Save className="size-4" /> {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}