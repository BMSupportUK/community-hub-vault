import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["admin", "management"],
  });
  if (!data) throw new Error("Forbidden");
}

export const getBoroTeamSheetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { teamSheetStatus } = await import("@/lib/boro-team-sheet.server");
    return teamSheetStatus();
  });

export const recheckBoroTeamSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { syncBoroTeamSheet } = await import("@/lib/boro-team-sheet.server");
    return syncBoroTeamSheet({ ignoreWindow: true });
  });

export const postBoroTeamSheetManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageUrl: string; caption?: string; sourceUrl?: string }) => {
    const url = String(input.imageUrl ?? "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) throw new Error("Enter a valid https image link");
    return { imageUrl: url, caption: input.caption?.trim() || null, sourceUrl: input.sourceUrl?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { postManualTeamSheet } = await import("@/lib/boro-team-sheet.server");
    return postManualTeamSheet(data);
  });

export const deleteBoroTeamSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { removeTeamSheet } = await import("@/lib/boro-team-sheet.server");
    return removeTeamSheet(data.id);
  });
