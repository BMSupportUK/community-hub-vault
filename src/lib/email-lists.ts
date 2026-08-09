/**
 * Email list segmentation.
 *
 * "competitions" — predictor / fantasy game entrants (including guests who have
 *   no BM Support account). They only ever get competition emails.
 * "support"      — BM Support account holders. Only these addresses may receive
 *   BM Support product emails (subscription expiry, tickets, credentials, etc.).
 *
 * Guest entrants are registered on the competitions list only, so they can never
 * be picked up by a BM Support mailing.
 */
export const EMAIL_LIST_COMPETITIONS = "competitions" as const;
export const EMAIL_LIST_SUPPORT = "support" as const;

export type EmailListKey = typeof EMAIL_LIST_COMPETITIONS | typeof EMAIL_LIST_SUPPORT;

/** Any Supabase client with service-role privileges. */
type AdminClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/** Add an address to a list (idempotent) and clear any previous unsubscribe. */
export async function registerEmailList(
  client: AdminClient,
  email: string,
  list: EmailListKey,
  source?: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    await client
      .from("email_list_members")
      .upsert(
        { email: normalized, list_key: list, source: source ?? null, unsubscribed_at: null },
        { onConflict: "email,list_key" },
      );
  } catch (e) {
    console.error("registerEmailList failed", { list, source, error: e });
  }
}

/** Mark an address as unsubscribed from a single list. */
export async function unsubscribeEmailList(
  client: AdminClient,
  email: string,
  list: EmailListKey,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  await client
    .from("email_list_members")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", normalized)
    .eq("list_key", list);
}

/**
 * Whether we may send an email on a given list to this address.
 * Checks global suppression, per-list unsubscribe, and — for the support list —
 * that the address actually belongs to a BM Support account (never a guest).
 */
export async function canEmailList(
  client: AdminClient,
  email: string | null | undefined,
  list: EmailListKey,
): Promise<boolean> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const { data: suppressed } = await client
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (suppressed) return false;

  const { data: member } = await client
    .from("email_list_members")
    .select("unsubscribed_at")
    .eq("email", normalized)
    .eq("list_key", list)
    .maybeSingle();
  if (member?.unsubscribed_at) return false;

  if (list === EMAIL_LIST_SUPPORT) {
    // Support mail only ever goes to real account holders.
    const { data: isAccount, error } = await client.rpc("email_is_account_holder", {
      _email: normalized,
    });
    if (error) {
      console.error("email_is_account_holder failed", error);
      return false;
    }
    if (!isAccount) return false;
  }

  return true;
}
