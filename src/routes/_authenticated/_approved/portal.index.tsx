import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved/portal/")({
  beforeLoad: () => { throw redirect({ to: "/shop", replace: true }); },
  head: () => ({ meta: [
    { title: "Customer Portal | BM Support" },
    { name: "description", content: "Your BM Support shop, orders, app logins and install guides in one place." },
    { property: "og:title", content: "Customer Portal | BM Support" },
    { property: "og:description", content: "Your BM Support shop, orders, app logins and install guides in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});
