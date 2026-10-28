import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DownloadLogRow = {
  id: string;
  createdAt: string;
  source: string;
  appName: string | null;
  version: string | null;
  customer: string | null;
  ticketId: string | null;
  orderId: string | null;
  ip: string | null;
  device: string | null;
  userAgent: string | null;
  bytes: number | null;
  reference: string | null;
  tvAddress: string | null;
};

/** Every app download, newest first. Admin and management only. */
export const listDownloadLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DownloadLogRow[]> => {
    const sb = context.supabase;
    const [{ data: isAdmin }, { data: isMgmt }] = await Promise.all([
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "management" }),
    ]);
    if (!isAdmin && !isMgmt) throw new Error("Forbidden");
    // RLS also limits this table to admin/management.
    const { data, error } = await sb
      .from("app_download_log")
      .select("id, created_at, source, app_name, version_name, user_id, ticket_id, order_id, ip, device, user_agent, bytes, enabler_reference, tv_address")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Could not load the download log");
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await sb.from("profiles").select("id, display_name, username").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.username || p.display_name || "Member");
    }
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source,
      appName: r.app_name,
      version: r.version_name,
      customer: r.user_id ? names.get(r.user_id) ?? "Member" : null,
      ticketId: r.ticket_id,
      orderId: r.order_id,
      ip: r.ip,
      device: r.device,
      userAgent: r.user_agent,
      bytes: r.bytes,
      reference: r.enabler_reference,
      tvAddress: r.tv_address,
    }));
  });
