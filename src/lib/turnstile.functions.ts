import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { BACKUP_PREFIX, judgeBackup } from "@/lib/captcha-backup";

export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(1).max(4096) }).parse(input),
  )
  .handler(async ({ data }) => {
    // Captcha blocked on the visitor's browser: fall back to our own checks.
    if (data.token.startsWith(BACKUP_PREFIX)) {
      const ip = getRequestIP({ xForwardedFor: true }) ?? getRequestHeader("cf-connecting-ip") ?? "unknown";
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`captcha-backup:${ip}`));
      const ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin.from("captcha_backup_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
      const verdict = judgeBackup(data.token, Date.now(), count ?? 0);
      if (verdict.ok) await supabaseAdmin.from("captcha_backup_attempts").insert({ ip_hash: ipHash });
      return { success: verdict.ok, error: verdict.reason ?? null };
    }
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) {
      console.error("[turnstile] TURNSTILE_SECRET not configured");
      return { success: false, error: "captcha-not-configured" };
    }
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      null;
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", data.token);
    if (ip) body.append("remoteip", ip);
    try {
      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body },
      );
      const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
      return { success: !!json.success, error: json["error-codes"]?.join(",") ?? null };
    } catch (e) {
      console.error("[turnstile] verify failed", e);
      return { success: false, error: "verify-failed" };
    }
  });