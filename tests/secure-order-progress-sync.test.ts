import { expect, test } from 'bun:test';
import { startSecureOrderProgressSync } from '../src/lib/secure-order-progress-sync';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function harness(refresh: () => Promise<void>) {
  let signal = () => {};
  let tick = () => {};
  let returned = () => {};
  let visible = true;
  let interval = 0;
  let cleaned = 0;
  const stop = startSecureOrderProgressSync({
    refresh,
    subscribe: (fn) => { signal = fn; return () => { cleaned++; }; },
    every: (fn, ms) => { tick = fn; interval = ms; return () => { cleaned++; }; },
    onReturn: (fn) => { returned = fn; return () => { cleaned++; }; },
    isVisible: () => visible,
  });
  return { signal: () => signal(), tick: () => tick(), returned: () => returned(), hide: () => { visible = false; }, show: () => { visible = true; }, stop, interval: () => interval, cleaned: () => cleaned };
}
test('checkout signals refresh immediately', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; });
  await flush(); h.signal(); await flush();
  expect(reads).toBe(2); h.stop();
});
test('fallback checks every five seconds only while visible and refreshes on return', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; });
  await flush(); expect(h.interval()).toBe(5000);
  h.hide(); h.tick(); expect(reads).toBe(1);
  h.show(); h.returned(); await flush(); expect(reads).toBe(2);
  h.tick(); await flush(); expect(reads).toBe(3); h.stop();
});
test('signals during a read queue one fresh read rather than competing stale reads', async () => {
  let reads = 0;
  let release = () => {};
  const h = harness(async () => { reads++; if (reads === 1) await new Promise<void>((resolve) => { release = resolve; }); });
  h.signal(); h.signal(); expect(reads).toBe(1);
  release(); await flush(); expect(reads).toBe(2); h.stop();
});
test('unmount removes all listeners and prevents further reads', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; });
  await flush(); h.stop(); h.signal(); h.tick(); h.returned(); await flush();
  expect(h.cleaned()).toBe(3); expect(reads).toBe(1);
});