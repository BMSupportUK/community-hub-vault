import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";
import { TicketHelpRequestedAlert } from "@/components/app/TicketHelpRequestedAlert";
import { FanZoneAccessCard } from "@/components/app/FanZoneAccessCard";
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
  return (
    <>
      <TwoFactorBanner />
      <Outlet />
      <FriendRequestsListener />
      <OutstandingTicketsAlert />
      <TicketAssignedAlert />
      <TicketHelpRequestedAlert />
      <FanZoneAccessCard />
    </>
  );
}
