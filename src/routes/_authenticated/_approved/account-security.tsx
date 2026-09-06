import { createFileRoute } from "@tanstack/react-router";
import { AccountSecurityView } from "@/components/app/AccountSecurityView";

export const Route = createFileRoute("/_authenticated/_approved/account-security")({
  component: AccountSecurityPage,
  head: () => ({
    meta: [
      { title: "Security & 2FA · BM Support" },
      { name: "description", content: "Manage two-factor authentication and screen lock for your BM Support account." },
      { property: "og:title", content: "Security & 2FA · BM Support" },
      { property: "og:description", content: "Manage two-factor authentication and screen lock for your BM Support account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AccountSecurityPage() {
  return <AccountSecurityView backTo="/home" />;
}
