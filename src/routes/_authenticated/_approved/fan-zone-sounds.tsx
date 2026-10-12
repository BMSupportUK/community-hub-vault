import { createFileRoute } from "@tanstack/react-router";
import { AdminSounds } from "./admin-sounds";

export const Route = createFileRoute("/_authenticated/_approved/fan-zone-sounds")({
  head: () => ({
    meta: [
      { title: "Boro Fan Zone sounds — Fan Zone admin" },
      { name: "description", content: "Test and replace the Boro Fan Zone alert sounds." },
      { property: "og:title", content: "Boro Fan Zone sounds — Fan Zone admin" },
      { property: "og:description", content: "Test and replace the Boro Fan Zone alert sounds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AdminSounds zone="fanzone" />,
});
