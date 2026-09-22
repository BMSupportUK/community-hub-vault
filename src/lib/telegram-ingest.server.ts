import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Telegram → Sports Guide import queue ──────────────────────────
// Server-only module (called from the Telegram webhook route). Forwarded
// listing posts are queued verbatim as one block; staff pick the category.

/** First meaningful line of a post, used as the queue item's heading. */
function postHeading(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.replace(/[*_`#>]+/g, "").trim())
    .find((l) => l.replace(/[^A-Za-z0-9]/g, "").length > 1);
  return (line || "Telegram listing").slice(0, 300);
}

export async function ingestTelegramPost(opts: {
  text: string;
  sourceRef: string;
  forwardedFrom: string | null;
}): Promise<{ queued: number }> {
  const text = opts.text.trim();
  if (!text) return { queued: 0 };

  const sourceRef = opts.sourceRef.slice(0, 400);
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("discord_import_queue")
    .select("id")
    .eq("source_ref", sourceRef)
    .limit(1);
  if (selErr) throw new Error(selErr.message);
  if ((existing ?? []).length > 0) return { queued: 0 };

  const { error } = await supabaseAdmin.from("discord_import_queue").insert({
    raw_text: text,
    parsed_event: {
      title: postHeading(text),
      time: null,
      date: null,
      channels: [],
      raw: text,
      suggested_category: null,
      suggested_subcategory: null,
    } as any,
    status: "pending",
    source: "telegram",
    source_ref: sourceRef,
    forwarded_from: opts.forwardedFrom,
  } as any);
  if (error) throw new Error(error.message);
  return { queued: 1 };
}


/** Who is allowed to feed the bot. First sender is auto-registered. */
export async function isAllowedTelegramSender(
  telegramUserId: number,
  username: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("telegram_sports_sources")
    .select("telegram_user_id");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    // Nobody registered yet — the first person to message the bot becomes
    // the owner-feeder (this is the person who just set the bot up).
    await supabaseAdmin
      .from("telegram_sports_sources")
      .insert({ telegram_user_id: telegramUserId, telegram_username: username });
    return true;
  }
  return rows.some((r: any) => Number(r.telegram_user_id) === telegramUserId);
}

export async function listTelegramSenders() {
  const { data, error } = await supabaseAdmin
    .from("telegram_sports_sources")
    .select("telegram_user_id, telegram_username, label, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}
