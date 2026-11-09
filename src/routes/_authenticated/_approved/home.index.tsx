import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { portalHomePath } from "@/lib/portal-home";
import { useProfilePortal } from "@/components/app/AccountProfiles";

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
  const { staff, loading } = useProfilePortal();
  if (loading) return null;
  return <Navigate to={staff ? "/staff-portal" : "/portal"} replace />;
}
