import { createFileRoute, redirect } from "@tanstack/react-router";

// Notification settings now live in the Customer Portal Settings tabs.
export const Route = createFileRoute("/_authenticated/_approved/notification-settings")({
  beforeLoad: () => { throw redirect({ to: "/portal/settings", search: { tab: "browser" }, replace: true }); },
});
