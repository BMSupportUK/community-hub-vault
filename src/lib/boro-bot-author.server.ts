// Shared identity for anything that posts into the Boro match day threads
// automatically, so those replies show up as "Boro Matchday Action" rather
// than under the thread starter's name.

export const MATCH_DAY_AUTHOR_USERNAME = "Boro Matchday Action";
const LEGACY_AUTHOR_USERNAMES = ["Boro Match Day Author"];
const MATCH_DAY_AUTHOR_EMAIL = "boro-match-day-author@bmsupport.uk";

let cachedId: string | null = null;

/**
 * Returns the profile id of the automated match day author, creating the
 * account (and its profile row) the first time it is needed. Falls back to
 * `null` so callers can keep using the thread author if creation fails.
 */
export async function getMatchDayAuthorId(): Promise<string | null> {
  if (cachedId) return cachedId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("username", [MATCH_DAY_AUTHOR_USERNAME, ...LEGACY_AUTHOR_USERNAMES])
    .maybeSingle();
  if (existing?.id) {
    cachedId = existing.id;
    await supabaseAdmin
      .from("profiles")
      .update({ username: MATCH_DAY_AUTHOR_USERNAME, display_name: MATCH_DAY_AUTHOR_USERNAME })
      .eq("id", existing.id)
      .neq("username", MATCH_DAY_AUTHOR_USERNAME);
    return cachedId;
  }

  // No profile yet — find or create the backing account.
  let userId: string | null = null;
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: MATCH_DAY_AUTHOR_EMAIL,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { display_name: MATCH_DAY_AUTHOR_USERNAME, username: MATCH_DAY_AUTHOR_USERNAME },
  });
  if (created?.user?.id) {
    userId = created.user.id;
  } else {
    // Most likely already registered — look it up.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId =
      list?.users?.find((u) => (u.email ?? "").toLowerCase() === MATCH_DAY_AUTHOR_EMAIL)?.id ?? null;
    if (!userId) {
      console.error("[boro-bot-author] could not create or find the match day author", createErr);
      return null;
    }
  }

  const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      username: MATCH_DAY_AUTHOR_USERNAME,
      display_name: MATCH_DAY_AUTHOR_USERNAME,
    },
    { onConflict: "id" },
  );
  if (profErr) {
    console.error("[boro-bot-author] profile upsert failed", profErr.message);
    return null;
  }

  await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "member" }, { onConflict: "user_id,role" });

  cachedId = userId;
  return cachedId;
}
