import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { portalHomePath } from "@/lib/portal-home";

// Home now sends each person to their own portal (staff or customer).
export const Route = createFileRoute("/_authenticated/_approved/home/")({
  component: HomeRedirect,
  head: () => ({
    meta: [
      { title: "Home | BM Support" },
      { name: "description", content: "Opening your BM Support portal." },
      { property: "og:title", content: "Home | BM Support" },
      { property: "og:description", content: "Opening your BM Support portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function HomeRedirect() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={portalHomePath(roles)} replace />;
}
