import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { makePin, pinHash } from "@/lib/enabler-pin";
import { DIRECT_PIN_TTL_MS } from "@/lib/direct-install";
import { decryptPin, encryptPin } from "@/lib/enabler-pin-crypto.server";

const key = () => process.env["ENABLER_PIN_ENCRYPTION_KEY"] ?? "";

/** BM Direct Install's own PIN (separate from BM TV Enabler): when the active one ends, and the PIN if asked. */
export const getDirectInstallPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reveal?: boolean }) => ({ reveal: !!d?.reveal }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row } = await db.from("enabler_login_pins").select("pin_encrypted, expires_at")
      .eq("user_id", context.userId).eq("kind", "direct").is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return { expires_at: null as string | null };
    const pin = data.reveal && row.pin_encrypted ? await decryptPin(row.pin_encrypted, key()) : undefined;
    return { expires_at: row.expires_at as string | null, ...(pin ? { pin } : {}) };
  });

/** Generate a new 30-minute Direct Install PIN; any earlier Direct Install PIN stops working. */
export const createDirectInstallPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("enabler_login_pins").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId).eq("kind", "direct").is("revoked_at", null);
    for (let i = 0; i < 8; i++) {
      const pin = makePin();
      const expires_at = new Date(Date.now() + DIRECT_PIN_TTL_MS).toISOString();
      const { error } = await db.from("enabler_login_pins").insert({
        user_id: context.userId, kind: "direct", pin_hash: await pinHash(pin), pin_encrypted: await encryptPin(pin, key()), expires_at,
      });
      if (error?.code === "23505") continue;
      if (error) throw new Error("Couldn't make a PIN. Try again.");
      return { pin, expires_at };
    }
    throw new Error("Couldn't make a PIN. Try again.");
  });
