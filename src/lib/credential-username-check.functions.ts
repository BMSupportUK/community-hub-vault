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
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = data.username.trim();
    const { data: rows, error } = await supabaseAdmin
      .schema("private")
      .from("app_credentials")
      .select("id")
      .ilike("app_login_name", name)
      .limit(1);
    if (error) throw new Error(error.message);
    return { exists: (rows ?? []).length > 0 };
  });
