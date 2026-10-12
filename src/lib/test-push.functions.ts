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
  .inputValidator((input: { kind?: string; audience?: "me" | "selected"; userIds?: string[] }) => ({
    kind: input?.kind,
    audience: input?.audience === "selected" ? "selected" as const : "me" as const,
    userIds: Array.isArray(input?.userIds) ? input.userIds.map(String).slice(0, 50) : [],
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "management"]);
    if (!roles?.length) throw new Error("Admins only");

    const { PHONE_ALERTS } = await import("@/lib/phone-alerts");
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

    const { pushToUser } = await import("@/lib/fcm.server");
    const targets = data.audience === "selected" ? [...new Set(data.userIds)] : [userId];
    if (!targets.length) throw new Error("Tick at least one account to test with.");

    const send = async (key: string) => {
      const k = KINDS[key];
      const total = { sent: 0, failed: 0 } as { sent: number; failed: number; skipped?: string };
      for (const t of targets) {
        const r = await pushToUser(t, { title: k.title, body: k.body, data: k.data });
        total.sent += r.sent;
        total.failed += r.failed;
        if (r.skipped && r.skipped !== "no device tokens") total.skipped = r.skipped;
      }
      return total;
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
