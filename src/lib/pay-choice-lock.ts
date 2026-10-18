/**
 * A customer pays an order one way only. Once they pick the card invoice, the
 * open-banking option is locked off for that order so they can't start both.
 */
export type PayMethodChoice = "card" | "bank";

/** Picking card is final for this order — it can't be undone back to open banking. */
export function nextPayChoice(current: PayMethodChoice, picked: PayMethodChoice): PayMethodChoice {
  if (current === "card") return "card";
  return picked;
}

/** Pay by bank is greyed out while the card invoice is the customer's choice. */
export function bankOptionDisabled(current: PayMethodChoice): boolean {
  return current === "card";
}

const key = (ref: string) => `bm-pay-choice-${ref}`;

export function storePayChoice(ref: string, choice: PayMethodChoice): void {
  try {
    sessionStorage.setItem(key(ref), choice);
  } catch {
    /* storage unavailable — the choice still applies for this visit */
  }
}

export function readStoredPayChoice(ref: string): PayMethodChoice | null {
  try {
    const raw = sessionStorage.getItem(key(ref));
    return raw === "card" || raw === "bank" ? raw : null;
  } catch {
    return null;
  }
}
