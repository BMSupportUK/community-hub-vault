import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only, bearer-bound switch verification; never updates customer lock state. */
export const getScreenLockAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("cache-control", "no-store");
    const { portalAdminAccessExpiresAt } = await import("@/lib/portal-admin-access.server");
    return { userId: context.userId, expiresAt: await portalAdminAccessExpiresAt(context.userId) };
  });