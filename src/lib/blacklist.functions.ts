import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles: string[] = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r: string) => r === "admin" || r === "management")) {
    throw new Error("Forbidden: admin or management only");
  }
}

function normalize(_kind: "email" | "ip", value: string) {
  return value.trim().toLowerCase();
}

export const listBlacklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("blacklist_entries")
      .select("id, kind, value, reason, created_by, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });

export const addBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      kind: z.enum(["email", "ip"]),
      value: z.string().trim().min(1).max(255),
      reason: z.string().trim().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const value = normalize(data.kind, data.value);
    if (data.kind === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new Error("Invalid email address");
      }
    } else {
      // basic ipv4/ipv6 sanity
      if (!/^[0-9a-fA-F:.]+$/.test(value)) {
        throw new Error("Invalid IP address");
      }
    }

    const { data: existingRows } = await supabaseAdmin
      .from("blacklist_entries")
      .select("id, value")
      .eq("kind", data.kind)
      .ilike("value", value);
    const existing = (existingRows ?? []).find(
      (r: any) => String(r.value ?? "").trim().toLowerCase() === value,
    );

    if (existing) {
      return { ok: true, banned: 0, duplicate: true as const };
    }

    const { error: insErr } = await supabaseAdmin
      .from("blacklist_entries")
      .insert({ kind: data.kind, value, reason: data.reason ?? null, created_by: userId });
    if (insErr) {
      if ((insErr as any).code === "23505") {
        return { ok: true, banned: 0, duplicate: true as const };
      }
      throw new Error(insErr.message);
    }

    // Find matching users and ban them
    const matchedUserIds = new Set<string>();

    if (data.kind === "email") {
      // page through auth users (typical instance: small)
      let page = 1;
      // limit to 10 pages of 1000 to avoid runaway
      for (let i = 0; i < 10; i++) {
        const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (lErr) break;
        for (const u of list?.users ?? []) {
          if ((u.email ?? "").toLowerCase() === value) matchedUserIds.add(u.id);
        }
        if (!list || (list.users?.length ?? 0) < 1000) break;
        page += 1;
      }
    } else {
      const { data: sigs } = await supabaseAdmin
        .from("signup_info")
        .select("user_id")
        .eq("ip", value);
      for (const r of sigs ?? []) matchedUserIds.add((r as any).user_id);
      const { data: logs } = await supabaseAdmin
        .from("user_ip_logs")
        .select("user_id")
        .eq("ip", value);
      for (const r of logs ?? []) matchedUserIds.add((r as any).user_id);
    }

    let banned = 0;
    for (const uid of matchedUserIds) {
      const { error: bErr } = await supabaseAdmin.rpc("apply_blacklist_ban" as never, { _user_id: uid } as never);
      if (!bErr) banned += 1;
    }

    return { ok: true, banned, duplicate: false as const };
  });

export const removeBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin.from("blacklist_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
/**
 * Ban a user straight from the gate chat: blacklists their email + known IPs,
 * applies the ban role and marks any pending application as denied.
 */
export const banUserFromGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      applicationId: z.string().uuid().optional(),
      reason: z.string().trim().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const reason = data.reason?.trim() || "Banned from gate chat";
    const added: { kind: "email" | "ip"; value: string }[] = [];

    const addEntry = async (kind: "email" | "ip", raw: string) => {
      const value = normalize(kind, raw);
      if (!value) return;
      const { data: existingRows } = await supabaseAdmin
        .from("blacklist_entries")
        .select("id, value")
        .eq("kind", kind)
        .ilike("value", value);
      if ((existingRows ?? []).some((r: any) => String(r.value ?? "").trim().toLowerCase() === value)) return;
      const { error } = await supabaseAdmin
        .from("blacklist_entries")
        .insert({ kind, value, reason, created_by: userId });
      if (!error) added.push({ kind, value });
    };

    // Email from auth
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = authUser?.user?.email ?? null;
    if (email) await addEntry("email", email);

    // Known IPs
    const ips = new Set<string>();
    const { data: sig } = await supabaseAdmin.from("signup_info").select("ip").eq("user_id", data.userId);
    for (const r of sig ?? []) if ((r as any).ip) ips.add(String((r as any).ip));
    const { data: hist } = await supabaseAdmin
      .from("user_location_history")
      .select("ip")
      .eq("user_id", data.userId)
      .limit(50);
    for (const r of hist ?? []) if ((r as any).ip) ips.add(String((r as any).ip));
    for (const ip of ips) await addEntry("ip", ip);

    // Apply the ban
    await supabaseAdmin.rpc("apply_blacklist_ban" as never, { _user_id: data.userId } as never);

    if (data.applicationId) {
      await supabaseAdmin
        .from("gate_applications")
        .update({ status: "denied", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("id", data.applicationId);
    }

    return { ok: true, email, ips: Array.from(ips), added };
  });
