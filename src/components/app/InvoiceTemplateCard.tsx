import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import invoiceHeader from "@/assets/invoice-sofa-tv-header.jpg";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_INVOICE_TEMPLATE, downloadReceipt, type InvoiceTemplateSettings } from "@/lib/receipt";

const fields: { key: keyof InvoiceTemplateSettings; label: string; multiline?: boolean; placeholder?: string }[] = [
  { key: "businessName", label: "Business name" }, { key: "invoiceHeading", label: "Invoice heading" },
  { key: "email", label: "Contact email" }, { key: "address", label: "Business address", multiline: true },
  { key: "registrationNumber", label: "Company number" }, { key: "vatNumber", label: "VAT number" },
  { key: "footerText", label: "Footer / thank-you wording", multiline: true },
];

export function InvoiceTemplateCard() {
  const [value, setValue] = useState<InvoiceTemplateSettings>(DEFAULT_INVOICE_TEMPLATE);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => { const { data } = await supabase.from("app_settings").select("value").eq("key", "invoice_template").maybeSingle(); if (data?.value) setValue({ ...DEFAULT_INVOICE_TEMPLATE, ...(data.value as Partial<InvoiceTemplateSettings>) }); setLoading(false); })(); }, []);
  const update = (key: keyof InvoiceTemplateSettings, text: string) => setValue((current) => ({ ...current, [key]: text }));
  const save = async () => { setSaving(true); const { data: auth } = await supabase.auth.getUser(); const { error } = await supabase.from("app_settings").upsert({ key: "invoice_template", value: value as never, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null }); setSaving(false); if (error) toast.error(error.message); else toast.success("Invoice template saved"); };
  const preview = async () => { try { await downloadReceipt({ id: "preview-order", order_ref: "SAMPLE-0042", created_at: new Date().toISOString(), status: "paid", total_cents: 6500, discount_cents: 1000, discount_code: "WELCOME10", shipping_name: "Sample Customer", email: "customer@example.com", paid_at: new Date().toISOString(), manual_pay_method: "stripe" }, [{ product_name: "12 Month Subscription", quantity: 1, unit_price_cents: 6000 }, { product_name: "Fire Stick Setup", quantity: 1, unit_price_cents: 1500 }], value); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create preview"); } };
  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading invoice template…</div>;
  return <section className="space-y-5">
    <div><h2 className="font-display text-xl font-bold flex items-center gap-2"><FileText className="size-5 text-primary" /> Invoice template</h2><p className="text-sm text-muted-foreground mt-1">These details appear on BM Support invoices customers download after payment.</p></div>
    <div className="overflow-hidden rounded-xl border border-border bg-card"><img src={invoiceHeader} alt="Person relaxing on a sofa watching television" loading="lazy" width={1600} height={560} className="w-full aspect-[20/7] object-cover" /><div className="p-4 flex items-end justify-between gap-4"><div><p className="font-display text-xl font-bold">{value.businessName}</p><p className="text-sm text-muted-foreground">{value.invoiceHeading}</p></div><span className="rounded-md bg-success/15 px-2 py-1 text-xs font-bold text-success">PAID</span></div></div>
    <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className={field.multiline ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}><span className="text-sm font-medium">{field.label}</span>{field.multiline ? <textarea value={value[field.key] ?? ""} onChange={(e) => update(field.key, e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /> : <input value={value[field.key] ?? ""} onChange={(e) => update(field.key, e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />}</label>)}</div>
    <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save template</Button><Button variant="outline" onClick={preview}><Download className="size-4" /> Download sample PDF</Button></div>
  </section>;
}
