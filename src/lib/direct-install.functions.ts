import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { beginDirectInstallSession, readDirectInstallSession } from "./direct-install-session.server";

/** Signed-in customer asks for a 30-minute BM Direct Install download link for Downloader. */
export const createDirectInstallLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await beginDirectInstallSession(db, context.userId, true);
    if (!result.url || !result.expiresAt) throw new Error("Couldn't make a download link. Please try again.");
    return { ...result, url: result.url, expiresAt: result.expiresAt };
  });

/** Already-installed TVs need a fresh progress session, but no download link. */
export const startDirectInstallSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    return beginDirectInstallSession(db, context.userId, false);
  });

/** Progress for the exact setup run selected by this customer. */
export const getDirectInstallProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid().nullable() }).parse(input))
  .handler(({ data, context }) => readDirectInstallSession(context.supabase, context.userId, data.sessionId));
