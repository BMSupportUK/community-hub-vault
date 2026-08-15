import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 32).toString("hex");
}

export function makeSalt(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

export function verifyPin(pin: string, salt: string, hash: string) {
  const computed = Buffer.from(hashPin(pin, salt), "hex");
  const target = Buffer.from(hash, "hex");
  return computed.length === target.length && timingSafeEqual(computed, target);
}

export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function authenticateGuest(email: string, pin: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("fantasy_guest_entrants")
    .select("id, pin_salt, pin_hash, display_name, team_name")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No guest account found for that email.");
  if (!verifyPin(pin, (data as any).pin_salt, (data as any).pin_hash)) {
    throw new Error("Incorrect PIN.");
  }
  return data as any;
}
