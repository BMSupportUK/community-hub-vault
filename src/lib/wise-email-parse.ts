/** Parse a Wise "money received" email into a payment. Pure — safe anywhere. */
export type ParsedWiseEmail = {
  amountCents: number;
  currency: string;
  senderName: string | null;
  reference: string;
};

const SYMBOL: Record<string, string> = { "£": "GBP", "€": "EUR", "$": "USD" };

function toCents(raw: string) {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ");
}

export function parseWiseEmail(subject: string, body: string): ParsedWiseEmail | null {
  const text = `${subject}\n${body}`.replace(/\u00a0/g, " ");
  // Only money-in emails.
  if (!/(sent you|received|you've got|you have received|paid you|money in)/i.test(text)) return null;
  // Skip Wise comms that mention money but are NOT money in: outgoing-transfer
  // confirmations ("We've received your £50 — converting it", "You've sent £50")
  // and "your transfer is on its way" notices.
  if (/(we'?ve received your|you'?ve sent|you'?re sending|converting your|your transfer (is |has ))/i.test(text)) return null;

  const amt =
    text.match(/([£€$])\s?([\d,]+(?:\.\d{1,2})?)/) ??
    null;
  const amtCode = text.match(/([\d,]+(?:\.\d{1,2})?)\s?(GBP|EUR|USD)\b/);
  const codeAmt = text.match(/\b(GBP|EUR|USD)\s?([\d,]+(?:\.\d{1,2})?)/i);
  let amountCents = NaN;
  let currency = "GBP";
  if (amt) {
    amountCents = toCents(amt[2]);
    currency = SYMBOL[amt[1]] ?? "GBP";
  } else if (amtCode) {
    amountCents = toCents(amtCode[1]);
    currency = amtCode[2];
  } else if (codeAmt) {
    amountCents = toCents(codeAmt[2]);
    currency = codeAmt[1].toUpperCase();
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;

  let senderName: string | null = null;
  const s1 = subject.match(/^(.+?)\s+(?:has\s+)?(?:sent|paid)\s+you/i) ?? text.match(/\n\s*([^\n]{2,60}?)\s+(?:has\s+)?(?:sent|paid)\s+you/i);
  const s2 = text.match(/\bfrom\s+([A-Z][^\n.,]{1,60}?)(?:\s+(?:to|into|with|on)\b|[.,\n]|$)/);
  if (s1) senderName = s1[1].trim();
  else if (s2) senderName = s2[1].trim();

  const ref = text.match(/reference[:\s]+["“]?([^\n"”.]{1,80})/i);
  return { amountCents, currency, senderName, reference: ref ? ref[1].trim() : "" };
}
