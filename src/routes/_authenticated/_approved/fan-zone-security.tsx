import { createFileRoute } from "@tanstack/react-router";
import { AccountSecurityView } from "@/components/app/AccountSecurityView";

export const Route = createFileRoute("/_authenticated/_approved/fan-zone-security")({
  component: FanZoneSecurityPage,
  head: () => ({
    meta: [
      { title: "Security & 2FA · Boro Fan Zone" },
      { name: "description", content: "Manage two-factor authentication and screen lock for your Boro Fan Zone account." },
      { property: "og:title", content: "Security & 2FA · Boro Fan Zone" },
      { property: "og:description", content: "Manage two-factor authentication and screen lock for your Boro Fan Zone account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function FanZoneSecurityPage() {
  return <AccountSecurityView backTo="/forum" />;
}
