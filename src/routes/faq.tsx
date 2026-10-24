import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LandingHeader } from "@/components/LandingHeader";
import { AdSenseSlot } from "@/components/app/AdSenseSlot";
import { useViewportLockable } from "@/hooks/use-viewport-lock";

export const Route = createFileRoute("/faq")({
  component: FaqPage,
  head: () => ({
    meta: [
      { title: "FAQ — BM Support Packages | North East UK & Overseas" },
      { name: "description", content: "Frequently asked questions about BM Support's digital access packages in North East UK, across the UK, and overseas." },
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
  const lockable = useViewportLockable();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("packages_faqs")
        .select("id, question, answer, sort_order")
        .order("sort_order");
      setFaqs((data ?? []) as Faq[]);
      if (data && data.length) setOpen(data[0].id);
    })();
  }, []);

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
    <div className={`bg-background flex flex-col ${lockable ? "fixed inset-0 overflow-hidden" : "min-h-dvh"}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <LandingHeader />

      <div className={`flex-1 flex items-start ${lockable ? "min-h-0 overflow-y-auto" : ""}`}>
      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full min-w-0">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3 text-center">Frequently asked questions</h1>
        <p className="text-muted-foreground text-center mb-10">Everything you need to know about BM Support packages — UK & overseas.</p>

        <div className="space-y-3">
          {faqs.map((f) => (
            <div key={f.id} className="border border-border rounded-lg bg-card relative">
              <button
                onClick={() => setOpen(open === f.id ? null : f.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
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

        <aside className="hidden xl:block w-full xl:w-[300px] xl:shrink-0 px-6 py-16">
          <div className="xl:sticky xl:top-16">
            <AdSenseSlot slot="sidebar" />
          </div>
        </aside>
      </div>

      <footer className="px-8 py-6 border-t border-border text-center text-xs text-muted-foreground">
        BM Support — North East UK & Overseas
      </footer>
    </div>
  );
}
