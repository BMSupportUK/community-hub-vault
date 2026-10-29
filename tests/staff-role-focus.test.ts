import { afterAll, expect, mock, test } from 'bun:test';

const effects: Array<() => void | (() => void)> = [];
const focusTarget = new EventTarget();
const previousWindow = globalThis.window;
Object.defineProperty(globalThis, 'window', { configurable: true, value: focusTarget });
let answer: Promise<{ data: Array<{ user_id: string; role: string }> | null; error: Error | null }> = Promise.resolve({
  data: [{ user_id: 'owner', role: 'admin' }, { user_id: 'manager', role: 'management' }], error: null,
});
let requests = 0;
mock.module('react', () => ({
  useState: () => [0, () => {}],
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));
mock.module('../src/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ in: () => { requests++; return answer; } }) }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: async () => {},
} }));
afterAll(() => {
  mock.restore();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
});

test('returning to BM Support preserves staff roles during pending and failed refreshes', async () => {
  const { useRoleFlashMap } = await import('../src/lib/role-flash');
  useRoleFlashMap();
  const cleanup = effects[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const original = useRoleFlashMap();
  expect(original.get('owner')).toBe('admin');
  expect(original.get('manager')).toBe('management');
  let finish: ((value: Awaited<typeof answer>) => void) | undefined;
  answer = new Promise((resolve) => { finish = resolve; });
  focusTarget.dispatchEvent(new Event('focus'));
  focusTarget.dispatchEvent(new Event('focus'));
  expect(requests).toBe(2);
  expect(useRoleFlashMap()).toBe(original);
  finish?.({ data: null, error: new Error('Connection interrupted') });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useRoleFlashMap()).toBe(original);
  answer = Promise.resolve({ data: [{ user_id: 'owner', role: 'admin' }, { user_id: 'manager', role: 'staff' }], error: null });
  focusTarget.dispatchEvent(new Event('focus'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useRoleFlashMap().get('manager')).toBe('staff');
  if (typeof cleanup === 'function') cleanup();
});