import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin/management only: sends a REAL test push of the chosen alert kind to
 * the caller's own registered devices, using the exact same data.kind values
 * production alerts use — so Android routes each one to its dedicated sound
 * channel and the phone plays the real tone.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind?: string; audience?: "me" | "everyone" }) => input)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "management"]);
    if (!roles?.length) throw new Error("Admins only");

    const { PHONE_ALERTS, phoneAlertRoles } = await import("@/lib/phone-alerts");
    const KINDS: Record<string, { title: string; body: string; data: Record<string, string> }> = {};
    for (const a of PHONE_ALERTS) {
      KINDS[a.key] = {
        title: `Test: ${a.label}`,
        body: `This is how the ${a.label} alert sounds.`,
        data: { kind: a.kinds[0], ...(a.event ? { event: a.event } : {}), url: "/home" },
      };
    }

    const kind = data?.kind;
    if (kind !== "all" && (!kind || !KINDS[kind])) throw new Error("Unknown kind");

    const { pushToUser, pushToRoles } = await import("@/lib/fcm.server");
    const everyone = data?.audience === "everyone";

    const send = async (key: string) => {
      const k = KINDS[key];
      if (everyone) {
        // Same recipients as the real alert: every account with the roles it goes to.
        const a = PHONE_ALERTS.find((x) => x.key === key)!;
        return pushToRoles(phoneAlertRoles(a), { title: k.title, body: k.body, data: k.data });
      }
      return pushToUser(userId, { title: k.title, body: k.body, data: k.data });
    };

    if (kind === "all") {
      const results: Record<string, { sent: number; failed: number; skipped?: string }> = {};
      for (const key of Object.keys(KINDS)) {
        results[key] = await send(key);
        // Small gap so the phone plays each tone separately.
        await new Promise((r) => setTimeout(r, 1500));
      }
      return results;
    }

    return { [kind!]: await send(kind!) };
  });
