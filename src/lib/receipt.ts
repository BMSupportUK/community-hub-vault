import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export interface ReceiptOrder {
  id: string;
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
}

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}

interface CurrencySetting {
  code: string;
  symbol: string;
  locale: string;
}

interface BrandSettings {
  brandName: string;
  brandTagline?: string;
  brandEmail?: string;
  brandAddress?: string;
  vatNumber?: string;
}

const DEFAULT_CURRENCY: CurrencySetting = { code: "GBP", symbol: "£", locale: "en-GB" };
const DEFAULT_BRAND: BrandSettings = {
  brandName: "BM Support",
  brandTagline: "Receipt",
  brandEmail: "support@bmsupport.uk",
};

async function loadSettings(): Promise<{ currency: CurrencySetting; brand: BrandSettings }> {
  const { data } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["currency", "brand"]);
  let currency: CurrencySetting = DEFAULT_CURRENCY;
  let brand: BrandSettings = DEFAULT_BRAND;
  for (const row of data ?? []) {
    const v = (row as { key: string; value: Record<string, unknown> }).value || {};
    if (row.key === "currency") {
      currency = {
        code: String(v.code ?? DEFAULT_CURRENCY.code),
        symbol: String(v.symbol ?? DEFAULT_CURRENCY.symbol),
        locale: String(v.locale ?? DEFAULT_CURRENCY.locale),
      };
    } else if (row.key === "brand") {
      brand = {
        brandName: String(v.brandName ?? DEFAULT_BRAND.brandName),
        brandTagline: v.brandTagline ? String(v.brandTagline) : DEFAULT_BRAND.brandTagline,
        brandEmail: v.brandEmail ? String(v.brandEmail) : DEFAULT_BRAND.brandEmail,
        brandAddress: v.brandAddress ? String(v.brandAddress) : undefined,
        vatNumber: v.vatNumber ? String(v.vatNumber) : undefined,
      };
    }
  }
  return { currency, brand };
}

function formatCurrency(cents: number, currency: CurrencySetting): string {
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
    }).format((cents || 0) / 100);
  } catch {
    return `${currency.symbol}${((cents || 0) / 100).toFixed(2)}`;
  }
}

export async function generateReceiptPdf(
  order: ReceiptOrder,
  items: ReceiptItem[],
): Promise<jsPDF> {
  const { currency, brand } = await loadSettings();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 110, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(brand.brandName, margin, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  if (brand.brandTagline) doc.text(brand.brandTagline, margin, 70);

  doc.setFontSize(10);
  let metaY = 50;
  const rightX = pageW - margin;
  const isPaid = !!order.paid_at;
  const heading = isPaid ? "RECEIPT" : "INVOICE";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(heading, rightX, metaY, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  metaY += 18;
  doc.text(`#${order.id.slice(0, 8).toUpperCase()}`, rightX, metaY, { align: "right" });
  metaY += 14;
  doc.text(new Date(order.created_at).toLocaleDateString(currency.locale), rightX, metaY, { align: "right" });

  // Body
  doc.setTextColor(15, 23, 42);
  let y = 150;

  // Bill to / From columns
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("FROM", margin, y);
  doc.text("BILLED TO", pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 16;

  const fromLines = [brand.brandName, brand.brandAddress, brand.brandEmail, brand.vatNumber ? `VAT: ${brand.vatNumber}` : null].filter(Boolean) as string[];
  const toLines = [
    order.shipping_name || "Customer",
    order.email || null,
    order.shipping_address || null,
  ].filter(Boolean) as string[];

  const startY = y;
  fromLines.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(line, pageW / 2 - margin - 12);
    doc.text(wrapped, margin, y + i * 14);
  });
  let toY = startY;
  toLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, pageW / 2 - margin - 12);
    doc.text(wrapped, pageW / 2, toY);
    toY += 14 * (Array.isArray(wrapped) ? wrapped.length : 1);
  });
  y = Math.max(startY + fromLines.length * 14, toY) + 18;

  // Status badge
  const statusLabel = isPaid ? "PAID" : order.status.toUpperCase();
  const badgeColor: [number, number, number] = isPaid ? [16, 185, 129] : [234, 179, 8];
  doc.setFillColor(...badgeColor);
  doc.roundedRect(margin, y, 60, 18, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(statusLabel, margin + 30, y + 12, { align: "center" });
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  y += 32;

  // Items table
  const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const discount = order.discount_cents ?? 0;

  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: items.map((i) => [
      i.product_name,
      String(i.quantity),
      formatCurrency(i.unit_price_cents, currency),
      formatCurrency(i.unit_price_cents * i.quantity, currency),
    ]),
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 8, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 50, halign: "center" },
      2: { cellWidth: 90, halign: "right" },
      3: { cellWidth: 90, halign: "right" },
    },
  });

  // Totals
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  const labelX = pageW - margin - 180;
  const valueX = pageW - margin;
  let ty = finalY;
  doc.setFontSize(10);

  doc.text("Subtotal", labelX, ty);
  doc.text(formatCurrency(subtotal, currency), valueX, ty, { align: "right" });
  ty += 16;

  if (discount > 0) {
    doc.text(`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`, labelX, ty);
    doc.text(`-${formatCurrency(discount, currency)}`, valueX, ty, { align: "right" });
    ty += 16;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(labelX, ty, valueX, ty);
  ty += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", labelX, ty);
  doc.text(formatCurrency(order.total_cents, currency), valueX, ty, { align: "right" });
  doc.setFont("helvetica", "normal");
  ty += 24;

  if (order.paid_at) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Paid on ${new Date(order.paid_at).toLocaleString(currency.locale)}`, valueX, ty, { align: "right" });
    doc.setTextColor(15, 23, 42);
    ty += 14;
  }

  if (order.notes) {
    ty += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", margin, ty);
    doc.setFont("helvetica", "normal");
    ty += 14;
    const wrapped = doc.splitTextToSize(order.notes, pageW - margin * 2);
    doc.text(wrapped, margin, ty);
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 12, pageW - margin, footerY - 12);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Thank you for your business${brand.brandEmail ? ` — questions? ${brand.brandEmail}` : ""}.`,
    pageW / 2,
    footerY,
    { align: "center" },
  );

  return doc;
}

export async function downloadReceipt(order: ReceiptOrder, items: ReceiptItem[]) {
  const doc = await generateReceiptPdf(order, items);
  const filename = `${order.paid_at ? "receipt" : "invoice"}-${order.id.slice(0, 8)}.pdf`;
  doc.save(filename);
}