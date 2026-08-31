import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  username: z.string().trim().min(1).max(100),
});

/**
 * Checks whether a login name exists on any credential in the system.
 * Returns only a boolean — never leaks credential details or owners.
 */
export const checkExistingUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<{ exists: boolean }> => {
    const { data: exists, error } = await context.supabase.rpc(
      "app_login_name_exists" as never,
      { _name: data.username.trim() } as never,
    );
    if (error) throw new Error(error.message);
    return { exists: exists === true };
  });
