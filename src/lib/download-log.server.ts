import { deviceFromUserAgent, clientIpFromHeaders } from "@/lib/device-from-user-agent";
import { sha256Hex } from "@/lib/enabler-pin";
import { isNewDownload, type DownloadSource } from "@/lib/download-log";

type Entry = {
  source: DownloadSource;
  buildId?: string | null;
  appName?: string | null;
  version?: string | null;
  userId?: string | null;
  bytes?: number | null;
};

/** Customer behind an Enabler device token (sent as x-enabler-token by newer apps). */
async function enablerOwner(token: string | null) {
  if (!token || token.length < 20 || token.length > 200) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("enabler_device_tokens")
    .select("enabler_login_pins(ticket_id, order_id)")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  const pin = (data as { enabler_login_pins?: { ticket_id: string | null; order_id: string | null } } | null)?.enabler_login_pins;
  if (!pin) return {};
  let userId: string | null = null;
  if (pin.ticket_id) {
    const { data: t } = await supabaseAdmin.from("tickets").select("user_id").eq("id", pin.ticket_id).maybeSingle();
    userId = (t?.user_id as string | null) ?? null;
  } else if (pin.order_id) {
    const { data: o } = await supabaseAdmin.from("orders").select("user_id").eq("id", pin.order_id).maybeSingle();
    userId = (o?.user_id as string | null) ?? null;
  }
  return { userId, ticketId: pin.ticket_id, orderId: pin.order_id };
}

/** Records one download. Never throws, so a logging problem can't block the file. */
export async function logDownload(request: Request, entry: Entry): Promise<void> {
  try {
    if (!isNewDownload(request.method, request.headers.get("range"))) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const owner = entry.userId ? {} : await enablerOwner(request.headers.get("x-enabler-token"));
    const ua = request.headers.get("user-agent");
    await supabaseAdmin.from("app_download_log").insert({
      source: entry.source,
      build_id: entry.buildId ?? null,
      app_name: entry.appName ?? null,
      version_name: entry.version ?? null,
      user_id: entry.userId ?? ("userId" in owner ? owner.userId : null) ?? null,
      ticket_id: "ticketId" in owner ? owner.ticketId : null,
      order_id: "orderId" in owner ? owner.orderId : null,
      ip: clientIpFromHeaders(request.headers),
      user_agent: ua?.slice(0, 400) ?? null,
      device: deviceFromUserAgent(ua),
      bytes: entry.bytes ?? null,
    });
  } catch (e) {
    console.error("[download-log] failed", e);
  }
}
