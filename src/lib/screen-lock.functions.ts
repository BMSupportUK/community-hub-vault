import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Retired PIN endpoints fail closed for older clients. */
export const requestLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("Screen lock now uses your account password. Sign out to reset a forgotten password.");
  });

export const approveLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async () => {
    throw new Error("Screen lock PIN resets are retired. Use the account password reset instead.");
  });

/** Owner/Management dismiss a request without resetting. */
export const denyLockReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("screen_lock_reset_requests")
      .update({ status: "denied", handled_by: userId, handled_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
