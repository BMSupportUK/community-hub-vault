import { isVideoTestOrder } from "./video-test-orders";

/** Staff can exercise the customer setup on designated test orders only. */
export function usesCustomerOrderRemoteTabs(token: string, canManage: boolean) {
  return !canManage || isVideoTestOrder(token);
}