import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { FanZonePresenceTracker } from "@/components/app/FanZonePresenceTracker";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useAppTheme } from "@/hooks/use-app-theme";
import { SoundUnlocker } from "@/components/app/SoundUnlocker";
import { TicketReplyAlert } from "@/components/app/TicketReplyAlert";
import { PushSoundBridge } from "@/components/app/PushSoundBridge";
import { MentionSoundAlert } from "@/components/app/MentionSoundAlert";
import { ToastNotificationBridge } from "@/components/app/ToastNotificationBridge";
import { LocalSendReceiverBridge } from "@/components/app/LocalSendReceiverBridge";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This channel does not exist.</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    console.error(error);
    // A new deploy replaces hashed asset filenames, so an open tab can request a
    // chunk that no longer exists. Reload once (cache-busted) to pick up the new build.
    const msg = String(error?.message ?? "");
    const isStaleChunk =
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(
        msg,
      );
    if (isStaleChunk && typeof window !== "undefined") {
      const key = "bm-stale-chunk-reloaded";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return;
      }
    }
    const timer = window.setTimeout(() => setShowError(true), 800);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (!showError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BM Support — Community Server" },
      { name: "description", content: "BM Suport community server with tickets, shop, guides, and staff tools." },
      { property: "og:title", content: "BM Support — Community Server" },
      { name: "twitter:title", content: "BM Support — Community Server" },
      { property: "og:description", content: "BM Suport community server with tickets, shop, guides, and staff tools." },
      { name: "twitter:description", content: "BM Suport community server with tickets, shop, guides, and staff tools." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4d3dde4a-0936-4979-a05b-00e7a61016c6/id-preview-b2ecc69b--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app-1778702728401.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4d3dde4a-0936-4979-a05b-00e7a61016c6/id-preview-b2ecc69b--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app-1778702728401.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "BM Support" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0a0a0a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&display=swap" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body className="dark">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useAppTheme();
  useEffect(() => {
    sessionStorage.removeItem("bm-stale-chunk-reloaded");
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RightClickGuard />
        <SoundUnlocker />
        <MentionSoundAlert />
        <TicketReplyAlert />
        <PushSoundBridge />
        <ToastNotificationBridge />
        <LocalSendReceiverBridge />
        <FanZonePresenceTracker />
        <Outlet />
        {/* z-index keeps toasts visible above the inactivity lock overlay (z-200) */}
        <Toaster theme="dark" position="bottom-right" style={{ zIndex: 2147483000 }} />

      </AuthProvider>
    </QueryClientProvider>
  );
}

function RightClickGuard() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  useEffect(() => {
    if (isAdmin) return;
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, [isAdmin]);
  return null;
}
