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
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

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
  console.error(error);
  const router = useRouter();
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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RightClickGuard />
        <Outlet />
        <Toaster theme="dark" position="bottom-right" />
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
