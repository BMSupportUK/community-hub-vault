import { FriendRequestsListener } from "@/components/app/FriendRequestsListener";
import { TwoFactorBanner } from "@/components/app/TwoFactorBanner";
import { OutstandingTicketsAlert } from "@/components/app/OutstandingTicketsAlert";
import { TicketAssignedAlert } from "@/components/app/TicketAssignedAlert";
import { TicketHelpRequestedAlert } from "@/components/app/TicketHelpRequestedAlert";
import { FanZoneAccessCard } from "@/components/app/FanZoneAccessCard";
import { SoundUnlocker } from "@/components/app/SoundUnlocker";
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
      <TicketHelpRequestedAlert />
      <FanZoneAccessCard />
    </>
  );
}