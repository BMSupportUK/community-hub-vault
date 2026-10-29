import { expect, test } from 'bun:test';
import { unreadRefreshScheduler } from './unread-refresh';

test('new messages refresh immediately and a burst queues one targeted follow-up', async () => {
  const calls: Array<Set<string> | null> = [];
  let finish: (() => void) | undefined;
  const first = new Promise<void>((resolve) => { finish = resolve; });
  const scheduler = unreadRefreshScheduler(async (rooms) => {
    calls.push(rooms);
    if (calls.length === 1) await first;
  });
  scheduler.request('staff');
  expect([...calls[0] ?? []]).toEqual(['staff']);
  for (let i = 0; i < 100; i++) scheduler.request('members');
  scheduler.request('staff');
  expect(calls.length).toBe(1);
  finish?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls.length).toBe(2);
  expect([...calls[1] ?? []]).toEqual(['members', 'staff']);
  scheduler.stop();
});

test('reconnection requests full reconciliation and unmount cancels queued refreshes', async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const calls: Array<Set<string> | null> = [];
  const scheduler = unreadRefreshScheduler(async (rooms) => { calls.push(rooms); await pending; });
  scheduler.request();
  expect(calls[0]).toBeNull();
  scheduler.request('staff');
  scheduler.stop();
  finish?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls.length).toBe(1);
});