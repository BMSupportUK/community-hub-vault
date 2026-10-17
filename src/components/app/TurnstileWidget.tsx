import { useEffect, useRef, useState } from "react";
import { backupToken } from "@/lib/captcha-backup";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector(
    `script[src="${SCRIPT_SRC}"]`,
  ) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((res) => existing.addEventListener("load", () => res()));
  }
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  onToken,
  onExpire,
}: {
  onToken: (token: string) => void;
  onExpire?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(Date.now());
  // Captcha couldn't load: hand back a backup token so the visitor isn't stuck.
  useEffect(() => { if (failed) onToken(backupToken(startedAt.current)); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    setFailed(false);
    // Blocked by an ad blocker / privacy setting: nothing renders at all.
    const watchdog = window.setTimeout(() => {
      if (!cancelled && ref.current && !ref.current.querySelector("iframe")) setFailed(true);
    }, 8000);
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onToken(token),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => setFailed(true),
        });
      })
      .catch((e) => { console.error(e); if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* noop */
        }
        widgetId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, attempt]);

  if (!siteKey) return null;
  return (
    <div className="space-y-2">
      <div key={attempt} ref={ref} className="flex justify-center" />
      {failed && (
        <p role="status" className="text-center text-xs text-muted-foreground">
          The security check couldn't load in your browser, so we'll use a backup check instead — just carry on.{" "}
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="font-semibold text-primary underline">Retry captcha</button>
        </p>
      )}
    </div>
  );
}