import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const ApprovedDeferredExtras = lazy(() =>
  import("@/components/app/ApprovedDeferredExtras").then((module) => ({
    default: module.ApprovedDeferredExtras,
  })),
);

function DeferUntilIdle({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1800 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(id);
  }, []);
  if (!ready) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

export const Route = createFileRoute("/_authenticated/_approved")({
  beforeLoad: async () => {
    // Pending users are intercepted by the parent layout, but block the loader too.
    // (No data needed here; auth context handles redirect UI.)
  },
  component: ApprovedLayout,
});

function ApprovedLayout() {
  return (
    <>
      <Outlet />
      <DeferUntilIdle>
        <ApprovedDeferredExtras />
      </DeferUntilIdle>
    </>
  );
}
