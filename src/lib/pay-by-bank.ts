/**
 * Stripe Pay by Bank (open banking) — customer-facing support information.
 *
 * Stripe picks the final bank list inside its own payment picker and can
 * change it at any time, so this is an informational list of the UK banks
 * that appear there, not a guarantee. Source: Stripe-powered Pay by Bank UK
 * list (Xero/Stripe, covers ~98% of UK consumers), checked Oct 2026. Every customer also sees the fallback:
 * if their bank is not supported they pay the Square card invoice instead.
 */
export const PAY_BY_BANK_BANKS = [
  "Barclays",
  "Bank of Scotland",
  "Danske Bank",
  "First Direct",
  "Halifax",
  "HSBC",
  "Lloyds Bank",
  "Monzo",
  "Nationwide",
  "NatWest",
  "Revolut",
  "Royal Bank of Scotland",
  "Santander",
  "TSB",
  "Ulster Bank",
] as const;

/** Shown under the bank list on the secure checkout page. */
export const PAY_BY_BANK_NOTE =
  "If your bank isn't in the list, it isn't supported yet — choose Card (Square) to pay by card invoice instead.";

/** One-line intro above the list. */
export const PAY_BY_BANK_INTRO =
  "Pay from your UK bank account — approve the payment in your banking app and it's confirmed in minutes.";

const BANK_NAME_FIXES: Record<string, string> = { lloyds: "Lloyds Bank", natwest: "NatWest", "starling": "Starling Bank" };

/**
 * Reads the supported-bank list out of the published Stripe Pay by Bank
 * (Xero/Stripe) help page text. Returns null when the page layout looks
 * wrong, so a broken page can never wipe the list customers see.
 */
export function parseSupportedBanks(pageText: string): string[] | null {
  const start = pageText.indexOf("Supported banks cover");
  if (start < 0) return null;
  const rest = pageText.slice(start).split("\n").slice(1);
  const banks: string[] = [];
  for (const raw of rest) {
    const line = raw.replace(/^[\s•*-]+/, "").trim();
    if (!line) continue;
    if (line.endsWith("?") || line.length > 40 || banks.length >= 60) break;
    const fixed = BANK_NAME_FIXES[line.toLowerCase()] ?? line;
    if (!banks.includes(fixed)) banks.push(fixed);
  }
  return banks.length >= 8 && banks.length < 60 ? banks : null;
}

/** Strips HTML tags into one-item-per-line text for parseSupportedBanks. */
export function htmlToLines(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}
