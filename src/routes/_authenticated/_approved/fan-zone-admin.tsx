import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "./admin";

export const Route = createFileRoute("/_authenticated/_approved/fan-zone-admin")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? (search.next as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Boro Fan Zone | Admin Dashboard" },
      { name: "description", content: "Admin tools for the Boro Fan Zone forum, fantasy and predictions." },
      { property: "og:title", content: "Boro Fan Zone | Admin Dashboard" },
      { property: "og:description", content: "Admin tools for the Boro Fan Zone forum, fantasy and predictions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AdminDashboard zone="fanzone" />,
});
