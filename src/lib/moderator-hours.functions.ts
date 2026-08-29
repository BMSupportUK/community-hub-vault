import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

/**
 * Lets a moderator add their own hourly slot (defaults come from business hours
 * in the UI, but they can pick any start/finish inside the day).
 */
export const addModeratorHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.end_time <= data.start_time) throw new Error("Finish time must be after the start time");

    const { data: isMod } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["moderator", "admin", "management"],
    });
    if (!isMod) throw new Error("Only moderators can add hourly slots");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("shift_slots").insert({
      shift_date: data.shift_date,
      start_time: data.start_time,
      end_time: data.end_time,
      slot_type: "hourly",
      required_role: "moderator",
      assigned_to: context.userId,
      notes: "Moderator hours",
      created_by: context.userId,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("You already have a slot at that time");
      throw new Error(error.message);
    }
    return { ok: true };
  });
