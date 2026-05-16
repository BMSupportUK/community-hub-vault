import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "credentials-backups";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("management")) {
    throw new Error("Forbidden");
  }
}

export type CredentialBackupFile = {
  path: string;
  name: string;
  size: number | null;
  created_at: string | null;
  count: number | null;
};

export const listCredentialBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CredentialBackupFile[]> => {
    await assertAdmin(context.supabase, context.userId);

    const out: CredentialBackupFile[] = [];
    const { data: years } = await supabaseAdmin.storage
      .from(BUCKET)
      .list("", { limit: 1000 });
    for (const y of years ?? []) {
      const { data: months } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(y.name, { limit: 1000 });
      for (const m of months ?? []) {
        const { data: files } = await supabaseAdmin.storage
          .from(BUCKET)
          .list(`${y.name}/${m.name}`, { limit: 1000 });
        for (const f of files ?? []) {
          out.push({
            path: `${y.name}/${m.name}/${f.name}`,
            name: f.name,
            size: (f.metadata as any)?.size ?? null,
            created_at: f.created_at ?? null,
            count: null,
          });
        }
      }
    }
    out.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
    return out;
  });

const RestoreInput = z.object({
  path: z.string().min(1).max(255),
  mode: z.enum(["merge", "replace"]).default("merge"),
});

export const restoreCredentialBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RestoreInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(data.path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "Snapshot not found");

    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await file.text());
    } catch {
      throw new Error("Snapshot is not valid JSON");
    }

    const { data: result, error } = await supabaseAdmin.rpc(
      "restore_app_credentials_from_backup" as never,
      { p_snapshot: snapshot as never, p_mode: data.mode } as never,
    );
    if (error) throw new Error(error.message);
    return result as {
      ok: boolean;
      mode: string;
      processed: number;
      inserted: number;
      updated: number;
    };
  });