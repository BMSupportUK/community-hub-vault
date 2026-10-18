import { createFileRoute, redirect } from "@tanstack/react-router";
import { ADMIN_CUSTOMERS_LINK } from "@/lib/admin-panel-access";

export const Route = createFileRoute("/_authenticated/_approved/admin-roles")({
  beforeLoad: () => { throw redirect({ ...ADMIN_CUSTOMERS_LINK, replace: true }); },
  head: () => ({ meta: [
    { title: "BM Support | Customer Management" },
    { name: "description", content: "Manage BM Support customers, memberships and roles in one protected screen." },
    { property: "og:title", content: "BM Support | Customer Management" },
    { property: "og:description", content: "Manage BM Support customers, memberships and roles in one protected screen." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
