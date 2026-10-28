import { isVideoTestOrder } from "./video-test-orders";

/** Staff can exercise the customer setup on designated test orders only. */
export function usesCustomerOrderRemoteTabs(token: string, canManage: boolean) {
  return !canManage || isVideoTestOrder(token);
}

/** Order installation help uses a pending ticket; its layout alerts staff after TV setup. */
export function orderStaffHelpTicket(userId: string, categoryId: string, orderRef: string | null) {
  return {
    user_id: userId,
    category_id: categoryId,
    subject: orderRef ? `Remote installation help — order ${orderRef}` : "Remote installation help",
    priority: "normal",
    remote_support: true,
    remote_setup_pending: true,
  };
}