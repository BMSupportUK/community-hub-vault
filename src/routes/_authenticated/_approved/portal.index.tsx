import { createFileRoute } from "@tanstack/react-router";
import { PortalHome } from "@/components/app/PortalHome";
import { PortalTabs } from "@/components/app/PortalTabs";

export const Route = createFileRoute("/_authenticated/_approved/portal/")({
  component: CustomerPortalHome,
  head: () => ({ meta: [
    { title: "Customer Portal | BM Support" },
    { name: "description", content: "Your BM Support shop, orders, app logins and install guides in one place." },
    { property: "og:title", content: "Customer Portal | BM Support" },
    { property: "og:description", content: "Your BM Support shop, orders, app logins and install guides in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function CustomerPortalHome() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PortalTabs active="home" />
      <PortalHome staff={false} />
    </div>
  );
}
