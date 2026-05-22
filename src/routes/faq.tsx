import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/faq")({
  component: FaqPage,
  head: () => ({
    meta: [
      { title: "FAQ — BM Support Packages | Middlesbrough UK & Overseas" },
      { name: "description", content: "Frequently asked questions about BM Support's digital access packages in Middlesbrough, across the UK, and overseas." },
      { property: "og:title", content: "FAQ — BM Support Packages" },
      { property: "og:description", content: "Answers to common questions about our UK and overseas support packages." },
      { property: "og:type", content: "website" },
      { rel: "canonical", href: "https://bmsupport.uk/faq" },
    ],
  }),
});

interface Faq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("packages_faqs")
      .select("id, question, answer, sort_order")
      .order("sort_order");
    setFaqs((data ?? []) as Faq[]);
    if (data && data.length && !open) setOpen(data[0].id);
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

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const payload = { question: editing.question, answer: editing.answer, sort_order: editing.sort_order };
    if (editing.id === "new") {
      await supabase.from("packages_faqs").insert(payload);
    } else {
      await supabase.from("packages_faqs").update(payload).eq("id", editing.id);
    }
    setEditing(null);
    setSaving(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await supabase.from("packages_faqs").delete().eq("id", id);
    load();
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Contact us</Link>
          <Link to="/packages" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Packages</Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 transition-all">Request access</Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3 text-center">Frequently asked questions</h1>
        <p className="text-muted-foreground text-center mb-10">Everything you need to know about BM Support packages — UK & overseas.</p>

        {canEdit && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setEditing({ id: "new", question: "", answer: "", sort_order: (faqs.at(-1)?.sort_order ?? 0) + 1 })}
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-muted"
            >
              <Plus className="size-4" /> Add FAQ
            </button>
          </div>
        )}

        <div className="space-y-3">
          {faqs.map((f) => (
            <div key={f.id} className="border border-border rounded-lg bg-card relative">
              {canEdit && (
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <button onClick={() => setEditing(f)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted" title="Edit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => remove(f.id)} className="p-1.5 rounded-md bg-background/70 border border-border hover:bg-muted text-red-500" title="Delete">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              <button
                onClick={() => setOpen(open === f.id ? null : f.id)}
                className={`w-full px-5 py-4 flex items-center justify-between text-left ${canEdit ? "pr-24" : ""}`}
              >
                <span className="font-medium">{f.question}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${open === f.id ? "rotate-180" : ""}`} />
              </button>
              {open === f.id && (
                <div className="px-5 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">{f.answer}</div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground">
            Can't find an answer? Contact us →
          </Link>
        </div>
      </main>

      <footer className="px-8 py-6 border-t border-border text-center text-xs text-muted-foreground">
        BM Support — Middlesbrough, UK & Overseas
      </footer>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">{editing.id === "new" ? "Add FAQ" : "Edit FAQ"}</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded"><X className="size-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Question</label>
                <input value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Answer</label>
                <textarea value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
                  rows={5}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                Sort
                <input type="number" value={editing.sort_order}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className="w-20 px-2 py-1 rounded bg-background border border-border" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                <Save className="size-4" /> {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}