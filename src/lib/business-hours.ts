import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the out-of-hours message to post, or null if currently open.
 * Uses the project-configured timezone via the `is_business_open` RPC.
 */
export async function getOutOfHoursMessage(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("is_business_open");
    if (error) return null;
    if (data === true) return null;
    return "⏰ Thanks for getting in touch! You've reached us outside our business hours. A staff member will reply as soon as we're open again.";
  } catch {
    return null;
  }
}