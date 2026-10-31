import type { ReactNode } from "react";
import { useSupportNotifications } from "@/hooks/use-support-notifications";

export function SupportNotificationScope({ children }: { children: ReactNode }) {
  return useSupportNotifications() ? children : null;
}