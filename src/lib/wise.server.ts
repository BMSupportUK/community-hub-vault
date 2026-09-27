/**
 * Wise API client (server-only). Read-only: profiles, balances and statements.
 * Token comes from WISE_API_TOKEN via the secret store — never sent to the browser.
 */

const WISE_BASE =
  (process.env.WISE_ENVIRONMENT ?? "live").toLowerCase() === "sandbox"
    ? "https://api.sandbox.transferwise.tech"
    : "https://api.wise.com";

export type WiseIncoming = {
  id: string;
  date: string | null;
  senderName: string | null;
  senderAccount: string | null;
  description: string;
  reference: string;
  amountCents: number;
  currency: string;
};

export class WiseAuthError extends Error {}
export class WiseApiError extends Error {}

async function wiseApi(path: string): Promise<any> {
  const token = (process.env.WISE_API_TOKEN ?? "").trim();
  if (!token) throw new Error("WISE_API_TOKEN not configured");
  const res = await fetch(`${WISE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error_description ||
      body?.error ||
      text?.slice(0, 200) ||
      res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new WiseAuthError(`Wise rejected the token (${res.status}): ${msg}`);
    }
    throw new WiseApiError(`Wise API ${res.status}: ${msg}`);
  }
  return body;
}

export function isWiseConfigured() {
  return Boolean(process.env.WISE_API_TOKEN);
}

type Profile = { id: number; type?: string; businessName?: string | null; firstName?: string | null };

async function getProfiles(): Promise<Profile[]> {
  for (const path of ["/v2/profiles", "/v1/profiles"]) {
    try {
      const data = await wiseApi(path);
      if (Array.isArray(data) && data.length) return data as Profile[];
    } catch (e) {
      if (e instanceof WiseAuthError) {
        throw new WiseAuthError(
          `Wise rejected the token when reading your account profiles. Wise's own message: "${(e as Error).message}". Wise tokens have no permission tick boxes — a token is full-access by default. A rejection here almost always means the token was created on the wrong Wise account or environment: log in at wise.com, switch to your BUSINESS profile (top-left profile switcher), then go to Settings → API tokens and create the token there. Tokens from wise.com/sandbox or a personal profile will not work.`,
        );
      }
    }
  }
  return [];
}

async function getBalances(profileId: number): Promise<Array<{ id: number; currency?: string; type?: string }>> {
  const attempts = [
    `/v2/profiles/${profileId}/balances?types=STANDARD`,
    `/v1/profiles/${profileId}/balances?type=STANDARD`,
    `/v4/profiles/${profileId}/balances?types=STANDARD`,
  ];
  for (const path of attempts) {
    try {
      const data = await wiseApi(path);
      if (Array.isArray(data) && data.length) return data;
    } catch (e) {
      if (e instanceof WiseAuthError) {
        throw new WiseAuthError(
          `Wise rejected the token when reading your balances. Wise's own message: "${(e as Error).message}".`,
        );
      }
    }
  }
  return [];
}

async function getStatement(
  profileId: number,
  balanceId: number,
  currency: string,
  days: number,
): Promise<any[]> {
  const intervalEnd = new Date();
  const intervalStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const qs = `currency=${encodeURIComponent(currency)}&intervalStart=${encodeURIComponent(
    intervalStart.toISOString(),
  )}&intervalEnd=${encodeURIComponent(intervalEnd.toISOString())}`;
  const attempts = [
    `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${qs}`,
    `/v2/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${qs}`,
    `/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${qs}`,
  ];
  const failures: string[] = [];
  for (const path of attempts) {
    try {
      const data = await wiseApi(path);
      if (Array.isArray(data?.transactions)) return data.transactions;
      failures.push(`${path.split("?")[0]}: ok but no transactions array`);
    } catch (e) {
      failures.push(`${path.split("?")[0]}: ${(e as Error).message}`);
      if (e instanceof WiseAuthError) continue;
    }
  }
  throw new WiseAuthError(
    `Wise would not return the account statement (profile ${profileId}, balance ${balanceId}, ${currency}). Attempts: ${failures.join(" | ")}`,
  );
}

function cents(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Incoming (CREDIT) payments from the last `days` days, newest first. */
export async function fetchWiseIncomingTransfers(days = 7): Promise<WiseIncoming[]> {
  const profiles = await getProfiles();
  if (!profiles.length) throw new WiseApiError("No Wise profiles are visible to this token.");
  const profile = profiles.find((p) => String(p.type).toUpperCase() === "BUSINESS") ?? profiles[0];

  const balances = await getBalances(profile.id);
  if (!balances.length) throw new WiseApiError("No Wise balance accounts are visible to this token.");
  const balance = balances.find((b) => b.currency === "GBP") ?? balances[0];
  const currency = balance.currency ?? "GBP";

  const transactions = await getStatement(profile.id, balance.id, currency, days);

  const incoming: WiseIncoming[] = [];
  for (const t of transactions ?? []) {
    if (String(t?.type ?? "").toUpperCase() !== "CREDIT") continue;
    const amountCents = cents(t?.amount?.value ?? t?.details?.amount?.value);
    if (amountCents <= 0) continue;
    const details = t?.details ?? {};
    const description = String(details.description ?? details.descriptionOptions ?? "");
    const reference = String(details.paymentReference ?? t.referenceNumber ?? "");
    const id = String(t.referenceNumber ?? `${t.date ?? ""}-${amountCents}-${description.slice(0, 24)}`);
    incoming.push({
      id,
      date: t.date ?? details.date ?? null,
      senderName: details.senderName ?? details.senderFullName ?? null,
      senderAccount: details.senderAccount ?? details.senderBankCountry ?? null,
      description,
      reference,
      amountCents,
      currency: t?.amount?.currency ?? currency,
    });
  }

  incoming.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  return incoming;
}
