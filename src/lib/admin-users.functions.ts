import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertMemberDetailsAccess } from "./member-details-access";

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.userId === userId) {
      throw new Error("You can't delete your own account.");
    }

    // Verify caller is admin or management via RLS-aware client
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    // Block deleting another admin unless caller is admin
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetIsAdmin = (targetRoles ?? []).some((r) => String(r.role) === "admin");
    if (targetIsAdmin && !callerRoles.includes("admin")) {
      throw new Error("Only an owner can delete another owner.");
    }

    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delError) throw new Error(delError.message);

    return { success: true };
  });

export const updateMemberUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        username: z
          .string()
          .trim()
          .min(3, "Username must be at least 3 characters")
          .max(30, "Username must be 30 characters or fewer")
          .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dots, dashes and underscores only"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Admin or management only — below cannot edit usernames.
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    const username = data.username.trim();

    await assertMemberDetailsAccess(callerRoles, async () => {
      const { data: targetRoles, error } = await supabase.from("user_roles").select("role").eq("user_id", data.userId);
      if (error) throw new Error(error.message);
      return (targetRoles ?? []).map((row) => String(row.role));
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", data.userId)
      .maybeSingle();
    if (existing) throw new Error("That username is already taken.");

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ username })
      .eq("id", data.userId);
    if (updateError) throw new Error(updateError.message);

    return { success: true, username };
  });

export const updateMemberEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email("Enter a valid email address"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    await assertMemberDetailsAccess(callerRoles, async () => {
      const { data: targetRoles, error } = await supabase.from("user_roles").select("role").eq("user_id", data.userId);
      if (error) throw new Error(error.message);
      return (targetRoles ?? []).map((row) => String(row.role));
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    return { success: true, email: data.email };
  });

export const listMemberEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gate } = await supabaseAdmin.from("admin_gate_unlocks").select("unlocked_until")
      .eq("user_id", userId).eq("gate", "roles").maybeSingle();
    if (!gate || new Date(gate.unlocked_until).getTime() <= Date.now()) {
      throw new Error("Unlock Members & Role Management with your password and PIN first.");
    }
    const emails: Record<string, string> = {};
    let page = 1;
    // paginate through auth users
    // perPage max 1000
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        if (u.email) emails[u.id] = u.email;
      }
      if (data.users.length < 1000) break;
      page += 1;
      if (page > 20) break; // safety
    }
    return { emails };
  });

/** Members & Role Management unlock: password and vault PIN are checked here, and the unlock is recorded server-side. */
export const unlockRolesGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ password: z.string().min(1).max(200), pin: z.string().min(1).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "management")) {
      return { ok: false as const, error: "Not allowed" };
    }
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = u.user?.email;
    if (!email) return { ok: false as const, error: "Incorrect password" };
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email, password: data.password });
    if (signErr || !signed.session) return { ok: false as const, error: "Incorrect password" };
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(`${context.userId}:${data.pin}`).digest("hex");
    const { data: row } = await supabaseAdmin.from("vault_pins").select("pin_hash").eq("user_id", context.userId).maybeSingle();
    if (!row || row.pin_hash !== hash) return { ok: false as const, error: "Incorrect PIN" };
    const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabaseAdmin.from("admin_gate_unlocks").upsert({ user_id: context.userId, gate: "roles", unlocked_until: until });
    return { ok: true as const, until };
  });
