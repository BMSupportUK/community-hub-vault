/** Decide whether an incoming Wise payment belongs to BM Support. Pure. */
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function isBmSupportPayment(
  row: { reference: string; description?: string | null; amountCents: number; matched: boolean },
  awaiting: Array<{ references: string[]; amountCents: number }>,
): boolean {
  if (row.matched) return true;
  const text = norm(`${row.reference} ${row.description ?? ""}`);
  for (const o of awaiting) {
    if (o.amountCents === row.amountCents) return true;
    if (o.references.some((r) => norm(r).length >= 6 && text.includes(norm(r)))) return true;
  }
  return false;
}
