export type StaffOrderDetailsData = {
  ref: string | null; name: string | null; createdAt: string;
  totalCents: number; discountCents: number; discountCode: string | null;
  customerKind: string; existingUsername: string | null; adultContent: boolean | null;
  method: string | null; status: string; email: string | null; referrerName: string | null;
  items: { name: string; qty: number; unitCents: number }[];
};

const money = (cents: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);
const methods: Record<string, string> = { square: "Square", stripe: "Stripe", wise: "Wise (bank transfer)", bank_transfer: "Bank transfer", cash: "Cash", crypto: "Crypto (USDT)" };

export function StaffOrderDetails({ details }: { details: StaffOrderDetailsData }) {
  const values = [
    ["Order", details.ref],
    ["Placed", new Date(details.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })],
    ["Name", details.name], ["Email", details.email],
    ["Customer", ["existing", "renewal"].includes(details.customerKind) ? "Existing customer (renewal)" : "New customer"],
    ["Referred by", details.referrerName], ["Username", details.existingUsername],
    ["Payment", methods[details.method ?? ""] ?? details.method],
    ["Discount code", details.discountCode],
    ["Adult content", details.adultContent == null ? "Not specified" : details.adultContent ? "Yes" : "No"],
    ["Status", details.status],
  ];
  return (
    <section aria-label="Customer order details" className="min-w-0 border-t border-border pt-5 space-y-5">
      <div>
        <h2 className="font-semibold mb-3">Order breakdown</h2>
        <div className="space-y-2 text-sm">
          {details.items.map((item, index) => <div key={index} className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.qty} × {item.name}</span><span className="shrink-0 tabular-nums">{money(item.qty * item.unitCents)}</span></div>)}
          {details.discountCents > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>−{money(details.discountCents)}</span></div>}
          <div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Total</span><span className="tabular-nums">{money(details.totalCents)}</span></div>
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-3">Order details</h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 text-sm">
          {values.filter(([, value]) => value).map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right font-medium">{value}</dd></div>)}
        </dl>
      </div>
    </section>
  );
}