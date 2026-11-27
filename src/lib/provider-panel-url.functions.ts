import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalisePanelUrl } from "@/lib/provider-panel-url";
import { maskPanelUrl, panelBase, savePanelBase } from "@/lib/provider-panel.server";

async function requireOwner(supabase: { rpc: (fn: "has_role", a: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: boolean | null }> }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Only the owner can manage the provider panel address.");
}

/** Owner only: a masked hint of the current address, never the address itself. */
export const getProviderPanelUrlHint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context.supabase as never, context.userId);
    return { hint: maskPanelUrl(await panelBase()) };
  });

export const saveProviderPanelUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().min(8).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase as never, context.userId);
    const clean = normalisePanelUrl(data.url);
    if (!clean) throw new Error("Enter a full address starting with https://");
    await savePanelBase(clean, context.userId);
    return { hint: maskPanelUrl(clean) };
  });
