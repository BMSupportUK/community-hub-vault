import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CheckoutTemplate, type CheckoutView } from "@/components/checkout/CheckoutTemplate";

export const Route = createFileRoute("/_authenticated/_approved/admin-checkout-templates")({
  head: () => ({
    meta: [
      { title: "Checkout page templates — BM Support" },
      { name: "description", content: "Preview every secure checkout page customers see for manual orders." },
      { property: "og:title", content: "Checkout page templates — BM Support" },
      { property: "og:description", content: "Preview every secure checkout page customers see for manual orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

const base = (o: Partial<CheckoutView["order"]>): CheckoutView => ({
  order: { ref: "MANUAL-0042", name: "Sample Customer", totalCents: 6500, discountCents: 1000, paidAt: null, completedAt: null, method: "stripe", customerKind: "new", ...o },
  items: [{ name: "12 Month Subscription", qty: 1, unitCents: 6000 }, { name: "Fire Stick Setup", qty: 1, unitCents: 1500 }],
  invoice: { status: "open", url: null, number: "INV-0042" },
  bank: { account_name: "BM Support", sort_code: "00-00-00", account_number: "12345678", iban: null, bic: null },
});

const TEMPLATES: { label: string; view: CheckoutView }[] = [
  { label: "Stripe invoice", view: base({ method: "stripe" }) },
  { label: "Square invoice", view: base({ method: "square" }) },
  { label: "Wise bank transfer", view: base({ method: "wise" }) },
  { label: "Cash thank you", view: base({ method: "cash" }) },
  { label: "Payment received", view: base({ method: "stripe", paidAt: "now" }) },
  { label: "Completed – new account", view: base({ method: "wise", paidAt: "now", completedAt: "now", customerKind: "new" }) },
  { label: "Completed – upgraded", view: base({ method: "wise", paidAt: "now", completedAt: "now", customerKind: "existing" }) },
];

function TemplatesPage() {
  const { hasRole } = useAuth();
  const [i, setI] = useState(0);
  if (!hasRole("admin") && !hasRole("management")) return <Navigate to="/admin" />;
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        <Link to="/admin" search={{ tab: "order-status" } as never} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to Orders</Link>
        <h1 className="font-display text-2xl font-bold">Secure checkout templates</h1>
        <p className="text-sm text-muted-foreground">What customers see on their private order page. Sample data only.</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t, idx) => (
            <button key={t.label} type="button" onClick={() => setI(idx)} className={`px-3 h-8 rounded-lg text-sm border ${idx === i ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground"}`}>{t.label}</button>
          ))}
        </div>
        <div className="rounded-2xl border border-border overflow-hidden">
          <CheckoutTemplate view={TEMPLATES[i].view} preview />
        </div>
      </div>
    </main>
  );
}
