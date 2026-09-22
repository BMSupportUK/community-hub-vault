import { supabase } from "@/integrations/supabase/client";

/**
 * Editable automated messages (admin dashboard → Automated messages & emails).
 * Falls back to the built-in wording if the row is missing or unreachable.
 */
export interface AutomatedMessage {
  key: string;
  label: string;
  description: string;
  body: string;
  placeholders: string[];
  sort_order: number;
  updated_at: string;
}

const CACHE_TTL_MS = 60 * 1000;
let cache: { at: number; map: Record<string, string> } | null = null;

export const AUTOMATED_MESSAGE_FALLBACKS: Record<string, string> = {
  ticket_out_of_hours:
    "⏰ Thanks for getting in touch! You've reached us outside our business hours. A staff member will reply as soon as we're open again.",
  ticket_bank_holiday:
    "🇬🇧 Thanks for getting in touch! Our office is closed today for {holiday} (UK public holiday), so no staff are available right now.\n\nYour ticket is safe in the queue and a member of our team will reply when the office reopens on {reopen}.",
  ticket_owner_management:
    "🔒 This ticket is private to the **Owner and Management team**.\n\nNo other staff or moderators can see or reply to this conversation. A member of management will respond as soon as possible.",
};

async function loadBodies(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map;
  try {
    const { data, error } = await supabase.from("automated_messages").select("key, body");
    if (error || !data) return cache?.map ?? {};
    const map: Record<string, string> = {};
    for (const row of data) map[row.key] = row.body;
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache?.map ?? {};
  }
}

/** Current text for an automated message, with {placeholders} filled in. */
export async function getAutomatedMessage(
  key: string,
  values: Record<string, string> = {},
): Promise<string> {
  const bodies = await loadBodies();
  let body = bodies[key] ?? AUTOMATED_MESSAGE_FALLBACKS[key] ?? "";
  for (const [name, value] of Object.entries(values)) {
    body = body.split(`{${name}}`).join(value);
  }
  return body;
}

/** Drop the cache so admin edits show up immediately. */
export function clearAutomatedMessageCache() {
  cache = null;
}
