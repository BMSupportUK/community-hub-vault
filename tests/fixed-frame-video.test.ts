import { expect, test } from 'bun:test';
import { fitContain, FIXED_FRAME_SIZE } from '../src/lib/fixed-frame-video';

test('portrait and landscape camera pictures both fit the same fixed square without stretching', () => {
  expect(fitContain(720, 1280, FIXED_FRAME_SIZE)).toEqual({ x: 158, y: 0, w: 405, h: 720 });
  expect(fitContain(1280, 720, FIXED_FRAME_SIZE)).toEqual({ x: 0, y: 158, w: 720, h: 405 });
});

test('no picture yet draws nothing', () => {
  expect(fitContain(0, 0, FIXED_FRAME_SIZE)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
});
