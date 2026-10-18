import { expect, test } from 'bun:test';
import { CUSTOMER_LIST_CHANGED, subscribeCustomerListRefresh } from '../src/lib/customer-list-refresh';

test('customer creation refreshes immediately and profile changes are read within 15 seconds while visible', () => {
  const target = new EventTarget();
  const doc = new EventTarget();
  let timer: (() => void) | undefined;
  let intervalMs = 0;
  let cleared = false;
  Object.defineProperties(target, {
    setInterval: { value: (fn: () => void, ms: number) => { timer = fn; intervalMs = ms; return 42; } },
    clearInterval: { value: (id: number) => { cleared = id === 42; } },
  });
  Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true });
  let reads = 0;
  const stop = subscribeCustomerListRefresh(() => reads++, target as unknown as Window, doc as unknown as Document);
  target.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED));
  expect(reads).toBe(1);
  expect(intervalMs).toBe(15_000);
  timer?.();
  expect(reads).toBe(2);
  Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
  timer?.();
  expect(reads).toBe(2);
  Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true });
  doc.dispatchEvent(new Event('visibilitychange'));
  expect(reads).toBe(3);
  stop();
  expect(cleared).toBe(true);
  target.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED));
  expect(reads).toBe(3);
});