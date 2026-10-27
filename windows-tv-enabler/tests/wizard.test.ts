import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Step, CodeResult, Wizard, newCode, ready, validHost, installFinished } = require('../renderer/wizard.js');

describe('Windows wizard matches the phone setup flow', () => {
  test('reopening restores a confirmation only until its original 24-hour expiry', () => {
    const expires = 1000 + 24 * 60 * 60 * 1000;
    const w = new Wizard();
    expect(w.resumeConfirmation('K7P4QX', expires, expires - 1)).toBe(true);
    expect(w.step).toBe(Step.DONE);
    w.reset();
    expect(w.resumeConfirmation('K7P4QX', expires, expires)).toBe(false);
    expect(w.step).toBe(Step.DEBUGGING);
  });
  test('debugging must be confirmed before connecting', () => {
    const w = new Wizard();
    w.connected('1234');
    expect(w.step).toBe(Step.DEBUGGING);
    w.confirmDebugging();
    expect(w.step).toBe(Step.CHECK);
  });
  test('wrong TV code does not move on; correct code starts setup', () => {
    const w = new Wizard(); w.confirmDebugging(); w.connected('1234');
    expect(w.enterCode('9999')).toBe(CodeResult.WRONG);
    expect(w.step).toBe(Step.TV_CODE);
    expect(w.enterCode('1234')).toBe(CodeResult.OK);
    expect(w.step).toBe(Step.SETUP);
  });
  test('three wrong codes go back to connect', () => {
    const w = new Wizard(); w.confirmDebugging(); w.connected('0001');
    w.enterCode('1'); w.enterCode('2');
    expect(w.enterCode('3')).toBe(CodeResult.RESET);
    expect(w.step).toBe(Step.CHECK);
  });
  test('only a ready TV check finishes', () => {
    const w = new Wizard(); w.confirmDebugging(); w.connected('1234'); w.enterCode('1234');
    w.setupFinished(false); expect(w.step).toBe(Step.SETUP);
    w.setupFinished(true); expect(w.step).toBe(Step.DONE); expect(w.ready).toBe(true);
    w.reset(); expect(w.step).toBe(Step.DEBUGGING); expect(w.ready).toBe(false);
  });
  test('helpers', () => {
    expect(newCode()).toMatch(/^\d{4}$/);
    expect(ready(true, true, true, true)).toBe(true);
    expect(ready(true, true, true, false)).toBe(false);
    expect(validHost('192.168.0.10')).toBe(true);
    expect(validHost('192.168.0.300')).toBe(false);
  });
});

describe('Wireless debugging pairing', () => {
  test('pairing from connect goes straight to setup, not before debugging is confirmed', () => {
    const w = new Wizard(); w.paired(); expect(w.step).toBe(Step.DEBUGGING);
    w.confirmDebugging(); w.paired(); expect(w.step).toBe(Step.SETUP);
  });
  test('address may carry the wireless debugging port', () => {
    expect(validHost('192.168.1.25:41235')).toBe(true);
    expect(validHost('192.168.1.25:70000')).toBe(false);
  });
});
