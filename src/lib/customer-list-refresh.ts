export const CUSTOMER_LIST_CHANGED = 'bm-customer-list-changed';

export function subscribeCustomerListRefresh(refresh: () => void, target: Window = window, doc: Document = document) {
  const refreshVisible = () => { if (doc.visibilityState === 'visible') refresh(); };
  const interval = target.setInterval(refreshVisible, 15_000);
  target.addEventListener(CUSTOMER_LIST_CHANGED, refreshVisible);
  target.addEventListener('focus', refreshVisible);
  doc.addEventListener('visibilitychange', refreshVisible);
  return () => {
    target.clearInterval(interval);
    target.removeEventListener(CUSTOMER_LIST_CHANGED, refreshVisible);
    target.removeEventListener('focus', refreshVisible);
    doc.removeEventListener('visibilitychange', refreshVisible);
  };
}