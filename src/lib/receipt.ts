import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import invoiceHeader from "@/assets/invoice-sofa-tv-header.jpg";

export interface ReceiptOrder {
  id: string;
  order_ref?: string | null;
  created_at: string;
  status: string;
  total_cents: number;
  discount_cents?: number | null;
  discount_code?: string | null;
  shipping_name?: string | null;
  shipping_address?: string | null;
  email?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  manual_pay_method?: string | null;
}

export interface ReceiptItem { product_name: string; quantity: number; unit_price_cents: number }
export interface InvoiceTemplateSettings {
  businessName: string;
  invoiceHeading: string;
  email?: string;
  address?: string;
  registrationNumber?: string;
  vatNumber?: string;
  footerText?: string;
}
interface CurrencySetting { code: string; symbol: string; locale: string }

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateSettings = {
  businessName: "BM Support",
  invoiceHeading: "PAID INVOICE",
  email: "support@bmsupport.uk",
  footerText: "Thank you for choosing BM Support.",
};
const DEFAULT_CURRENCY: CurrencySetting = { code: "GBP", symbol: "£", locale: "en-GB" };

function normaliseTemplate(value?: Partial<InvoiceTemplateSettings> | null): InvoiceTemplateSettings {
  return {
    businessName: String(value?.businessName || DEFAULT_INVOICE_TEMPLATE.businessName),
    invoiceHeading: String(value?.invoiceHeading || DEFAULT_INVOICE_TEMPLATE.invoiceHeading),
    email: value?.email ? String(value.email) : DEFAULT_INVOICE_TEMPLATE.email,
    address: value?.address ? String(value.address) : undefined,
    registrationNumber: value?.registrationNumber ? String(value.registrationNumber) : undefined,
    vatNumber: value?.vatNumber ? String(value.vatNumber) : undefined,
    footerText: value?.footerText ? String(value.footerText) : DEFAULT_INVOICE_TEMPLATE.footerText,
  };
}

async function loadSettings(override?: Partial<InvoiceTemplateSettings>): Promise<{ currency: CurrencySetting; template: InvoiceTemplateSettings }> {
  if (override) return { currency: DEFAULT_CURRENCY, template: normaliseTemplate(override) };
  const { data } = await supabase.from("app_settings").select("key,value").in("key", ["currency", "invoice_template"]);
  let currency = DEFAULT_CURRENCY;
  let template = DEFAULT_INVOICE_TEMPLATE;
  for (const row of data ?? []) {
    const value = (row as { key: string; value: Record<string, unknown> }).value || {};
    if (row.key === "currency") currency = { code: String(value.code ?? "GBP"), symbol: String(value.symbol ?? "£"), locale: String(value.locale ?? "en-GB") };
    if (row.key === "invoice_template") template = normaliseTemplate(value as Partial<InvoiceTemplateSettings>);
  }
  return { currency, template };
}

function money(cents: number, currency: CurrencySetting) {
  try { return new Intl.NumberFormat(currency.locale, { style: "currency", currency: currency.code }).format(cents / 100); }
  catch { return `${currency.symbol}${(cents / 100).toFixed(2)}`; }
}
function safeDate(value: string, locale: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}
function methodLabel(method?: string | null) {
  return ({ stripe: "Card via Stripe", square: "Card via Square", cash: "Cash", wise: "Bank transfer", bank_transfer: "Bank transfer", crypto: "USDT" } as Record<string, string>)[String(method)] ?? (method || "Payment confirmed");
}
async function imageDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
}

export async function generateReceiptPdf(order: ReceiptOrder, items: ReceiptItem[], override?: Partial<InvoiceTemplateSettings>): Promise<jsPDF> {
  if (!order.paid_at || order.status === "cancelled") throw new Error("Invoice is available after payment is confirmed.");
  const { currency, template } = await loadSettings(override);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  try { doc.addImage(await imageDataUrl(invoiceHeader), "JPEG", 0, 0, pageW, 168); } catch { doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageW, 168, "F"); }
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, 285, 168, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(25); doc.text(template.businessName, margin, 58);
  doc.setFontSize(15); doc.text(template.invoiceHeading.toUpperCase(), margin, 88);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const ref = order.order_ref || order.id.slice(0, 8).toUpperCase();
  doc.text(`Invoice ${ref}`, margin, 111); doc.text(`Paid ${safeDate(order.paid_at, currency.locale, true)}`, margin, 128);
  doc.setFillColor(16, 185, 129); doc.roundedRect(margin, 140, 52, 17, 4, 4, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("PAID", margin + 26, 151.5, { align: "center" });

  doc.setTextColor(15, 23, 42); let y = 205;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("FROM", margin, y); doc.text("BILLED TO", 315, y); doc.text("INVOICE DETAILS", 455, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 16;
  const from = [template.businessName, template.address, template.email, template.registrationNumber ? `Company: ${template.registrationNumber}` : null, template.vatNumber ? `VAT: ${template.vatNumber}` : null].filter(Boolean) as string[];
  const billed = [order.shipping_name || "Customer", order.email, order.shipping_address].filter(Boolean) as string[];
  const details = [`Order: ${ref}`, `Placed: ${safeDate(order.created_at, currency.locale)}`, `Method: ${methodLabel(order.manual_pay_method)}`];
  const drawLines = (lines: string[], x: number, width: number) => { let lineY = y; for (const line of lines) { const wrapped = doc.splitTextToSize(line, width); doc.text(wrapped, x, lineY); lineY += 12 * wrapped.length; } return lineY; };
  y = Math.max(drawLines(from, margin, 220), drawLines(billed, 315, 125), drawLines(details, 455, 100)) + 20;
  const subtotal = items.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
  const discount = Number(order.discount_cents ?? 0);
  autoTable(doc, {
    startY: y, head: [["Description", "Qty", "Unit price", "Amount"]],
    body: items.map((item) => [item.product_name, String(item.quantity), money(item.unit_price_cents, currency), money(item.unit_price_cents * item.quantity, currency)]),
    theme: "grid", margin: { left: margin, right: margin, bottom: 92 }, rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 8, textColor: [15, 23, 42], lineColor: [226, 232, 240], overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 42, halign: "center" }, 2: { cellWidth: 78, halign: "right" }, 3: { cellWidth: 78, halign: "right" } },
  });
  const last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let ty = last + 18;
  if (ty > pageH - 150) { doc.addPage(); ty = 60; }
  const labelX = pageW - margin - 170; const valueX = pageW - margin;
  doc.setFontSize(10); doc.text("Subtotal", labelX, ty); doc.text(money(subtotal, currency), valueX, ty, { align: "right" }); ty += 17;
  if (discount > 0) { doc.setTextColor(5, 130, 95); doc.text(`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`, labelX, ty); doc.text(`-${money(discount, currency)}`, valueX, ty, { align: "right" }); doc.setTextColor(15, 23, 42); ty += 17; }
  doc.setDrawColor(203, 213, 225); doc.line(labelX, ty, valueX, ty); ty += 18; doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Total paid", labelX, ty); doc.text(money(order.total_cents, currency), valueX, ty, { align: "right" });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); const fy = pageH - 38; doc.setDrawColor(226, 232, 240); doc.line(margin, fy - 14, pageW - margin, fy - 14); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139); const footer = `${template.footerText || ""}${template.email ? `  ·  ${template.email}` : ""}`; doc.text(doc.splitTextToSize(footer, pageW - margin * 2), margin, fy); doc.text(`${page} / ${pages}`, pageW - margin, fy, { align: "right" }); }
  return doc;
}

export async function downloadReceipt(order: ReceiptOrder, items: ReceiptItem[], override?: Partial<InvoiceTemplateSettings>) {
  const doc = await generateReceiptPdf(order, items, override);
  const ref = (order.order_ref || order.id.slice(0, 8)).replace(/[^a-z0-9-]/gi, "-");
  doc.save(`BM-Support-Invoice-${ref}.pdf`);
}
