import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(1).max(4096) }).parse(input),
  )
  .handler(async ({ data }) => {
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