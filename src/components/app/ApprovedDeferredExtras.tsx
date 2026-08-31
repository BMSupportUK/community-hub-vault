import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";
import { PaymentConfirmedAlert } from "@/components/app/PaymentConfirmedAlert";
import { TicketHelpRequestedAlert } from "@/components/app/TicketHelpRequestedAlert";
import { FanZoneAccessCard } from "@/components/app/FanZoneAccessCard";
import { ScreenLockProvider } from "@/components/app/ScreenLockProvider";
import { ScreenLockResetAlerts } from "@/components/app/ScreenLockResetAlerts";
import { usePushRegister } from "@/hooks/use-push-register";

export function ApprovedDeferredExtras() {
  usePushRegister();

  return (
    <>
      <TwoFactorBanner />
      <FriendRequestsListener />
      <OutstandingTicketsAlert />
      <TicketAssignedAlert />
      <PaymentConfirmedAlert />
      <TicketHelpRequestedAlert />
      <FanZoneAccessCard />
      <ScreenLockProvider />
      <ScreenLockResetAlerts />
    </>
  );
}
