import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";
import { TicketHelpRequestedAlert } from "@/components/app/TicketHelpRequestedAlert";
import { HomeChannelsSidebar } from "@/components/app/HomeChannelsSidebar";
import { usePushRegister } from "@/hooks/use-push-register";

export const Route = createFileRoute("/_authenticated/_approved")({
  beforeLoad: async () => {
    // Pending users are intercepted by the parent layout, but block the loader too.
    // (No data needed here; auth context handles redirect UI.)
  },
  component: ApprovedLayout,
});

function ApprovedLayout() {
  usePushRegister();
  const path = useRouterState({ select: (r) => r.location.pathname });
  // Pages that render their own channel column / sidebar must opt out so we
  // don't double up.
  const ownsSidebar =
    path.startsWith("/home") ||
    path.startsWith("/shop") ||
    path.startsWith("/moderation");
  return (
    <>
      <TwoFactorBanner />
      {ownsSidebar ? (
        <Outlet />
      ) : (
        <>
          <HomeChannelsSidebar />
          <Outlet />
        </>
      )}
      <FriendRequestsListener />
      <OutstandingTicketsAlert />
      <TicketAssignedAlert />
      <TicketHelpRequestedAlert />
    </>
  );
}
