import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";
import { TicketReplyAlert } from "@/components/app/TicketReplyAlert";
import { PushSoundBridge } from "@/components/app/PushSoundBridge";
import { PaymentConfirmedAlert } from "@/components/app/PaymentConfirmedAlert";
import { TicketHelpRequestedAlert } from "@/components/app/TicketHelpRequestedAlert";
import { FanZoneAccessCard } from "@/components/app/FanZoneAccessCard";
import { SoundUnlocker } from "@/components/app/SoundUnlocker";
import { ScreenLockProvider } from "@/components/app/ScreenLockProvider";
import { ScreenLockResetAlerts } from "@/components/app/ScreenLockResetAlerts";
import { usePushRegister } from "@/hooks/use-push-register";

export function ApprovedDeferredExtras() {
  usePushRegister();

  return (
    <>
      <SoundUnlocker />
      <TwoFactorBanner />
      <FriendRequestsListener />
      <OutstandingTicketsAlert />
      <TicketAssignedAlert />
      <TicketReplyAlert />
      <PaymentConfirmedAlert />
      <TicketHelpRequestedAlert />
      <FanZoneAccessCard />
      <ScreenLockProvider />
      <ScreenLockResetAlerts />
    </>
  );
}
