import { expect, test } from 'bun:test';
import { RotationRecovery } from '../src/lib/rotation-recovery';

test('rotation notice does not clear for old frames before camera replacement', () => {
  const recovery = new RotationRecovery();
  recovery.begin(true);
  for (const now of [0, 1000, 13000, 60000]) expect(recovery.presented(now, false)).toBe(false);
  expect(recovery.active).toBe(true);
});

test('notice stays for black frames and clears only once fresh picture is flowing', () => {
  const recovery = new RotationRecovery();
  recovery.begin(true);
  recovery.cameraReady();
  expect(recovery.presented(13000, true)).toBe(false);
  expect(recovery.presented(14000, false)).toBe(false);
  expect(recovery.presented(14250, false)).toBe(false);
  expect(recovery.presented(14500, false)).toBe(true);
  expect(recovery.active).toBe(false);
});

test('another rotation or black frame resets the returned-picture evidence', () => {
  const recovery = new RotationRecovery();
  recovery.begin(false);
  recovery.presented(0, false);
  recovery.presented(250, false);
  expect(recovery.presented(500, true)).toBe(false);
  expect(recovery.presented(750, false)).toBe(false);
  recovery.begin(true);
  expect(recovery.presented(2000, false)).toBe(false);
  expect(recovery.active).toBe(true);
});

test('deliberately switching the camera off clears the rotation notice', () => {
  const recovery = new RotationRecovery();
  recovery.begin(true);
  recovery.cameraOff();
  expect(recovery.active).toBe(false);
});