import { expect, test } from 'bun:test';
import { cropView, fitContain, FIXED_FRAME_SIZE } from '../src/lib/fixed-frame-video';

test('portrait and landscape camera pictures both fit the same fixed square without stretching', () => {
  expect(fitContain(720, 1280, FIXED_FRAME_SIZE)).toEqual({ x: 158, y: 0, w: 405, h: 720 });
  expect(fitContain(1280, 720, FIXED_FRAME_SIZE)).toEqual({ x: 0, y: 158, w: 720, h: 405 });
});

test('no picture yet draws nothing', () => {
  expect(fitContain(0, 0, FIXED_FRAME_SIZE)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
});

test('staff view follows the customer: tall when upright, wide when turned', () => {
  const tall = cropView(1280, 900, { w: 720, h: 1280 }, false);
  expect(tall.boxH).toBe(900);
  expect(tall.boxW).toBeLessThan(tall.boxH);
  const wide = cropView(1280, 900, { w: 1280, h: 720 }, false);
  expect(wide.boxW).toBe(1280);
  expect(wide.boxH).toBe(720);
  expect(wide.square).toBe(1280);
});

test('older customer pages without a shape keep the full view', () => {
  expect(cropView(1280, 900, null, false)).toEqual({ boxW: 1280, boxH: 900, square: null });
});
