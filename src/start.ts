import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { enforceProfileActions } from "@/lib/profile-access-middleware";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Any action refused for pending 2FA sends the user to the code screen, then back here.
const mfaChallengeRedirect = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (typeof window !== "undefined" && error instanceof Error && error.message.includes("Complete two-factor authentication")) {
      try { sessionStorage.setItem("post-login-next", window.location.pathname + window.location.search); } catch { /* optional */ }
      window.location.assign("/mfa-challenge");
    }
    throw error;
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [mfaChallengeRedirect, attachSupabaseAuth, enforceProfileActions],
}));
