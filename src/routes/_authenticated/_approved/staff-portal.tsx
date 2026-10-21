import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { PortalHome } from "@/components/app/PortalHome";
import { isStaffPortalUser } from "@/lib/portal-home";

export const Route = createFileRoute("/_authenticated/_approved/staff-portal")({
  component: StaffPortalPage,
  head: () => ({
    meta: [
      { title: "Staff Portal | BM Support" },
      { name: "description", content: "BM Support staff portal with your working status and shift details." },
      { property: "og:title", content: "Staff Portal | BM Support" },
      { property: "og:description", content: "BM Support staff portal with your working status and shift details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StaffPortalPage() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (!isStaffPortalUser(roles)) return <Navigate to="/portal" replace />;
  return <PortalHome staff />;
}
