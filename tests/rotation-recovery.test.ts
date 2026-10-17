import { expect, test } from 'bun:test';
import { RotationRecovery } from '../src/lib/rotation-recovery';

const flow = (r: RotationRecovery, from: number, to: number, black = false) => {
  let cleared = false;
  for (let t = from; t <= to; t += 100) cleared = r.presented(t, black) || cleared;
  return cleared;
};

test('frames right after the turn (before the new camera) do not clear the notice', () => {
  const r = new RotationRecovery();
  r.begin(true, 0);
  expect(flow(r, 0, 2400)).toBe(false);
  expect(r.active).toBe(true);
});

test('notice clears once the picture is back even if camera-ready never arrives', () => {
  const r = new RotationRecovery();
  r.begin(true, 0);
  expect(flow(r, 0, 2400)).toBe(false);
  expect(flow(r, 2500, 4000)).toBe(true);
  expect(r.active).toBe(false);
});

test('notice stays while the picture is black, however long it takes', () => {
  const r = new RotationRecovery();
  r.begin(true, 0);
  r.cameraReady();
  expect(flow(r, 0, 60000, true)).toBe(false);
  expect(r.active).toBe(true);
  expect(flow(r, 60100, 61000)).toBe(true);
});

test('a black frame resets the returned-picture evidence', () => {
  const r = new RotationRecovery();
  r.begin(false, 0);
  flow(r, 0, 400);
  expect(r.presented(500, true)).toBe(false);
  expect(r.presented(600, false)).toBe(false);
  expect(r.active).toBe(true);
});

test('deliberately switching the camera off clears the rotation notice', () => {
  const r = new RotationRecovery();
  r.begin(true, 0);
  r.cameraOff();
  expect(r.active).toBe(false);
});
