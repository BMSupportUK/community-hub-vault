import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";

export const Route = createFileRoute("/_authenticated/_approved")({
  beforeLoad: async () => {
    // Pending users are intercepted by the parent layout, but block the loader too.
    // (No data needed here; auth context handles redirect UI.)
  },
  component: () => (
    <>
      <TwoFactorBanner />
      <Outlet />
      <FriendRequestsListener />
      <OutstandingTicketsAlert />
      <TicketAssignedAlert />
    </>
  ),
});
