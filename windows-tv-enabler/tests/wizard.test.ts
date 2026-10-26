import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Step, Wizard, ready, validHost } = require('../renderer/wizard.js');

describe('Windows wizard matches the phone setup flow', () => {
  test('starts at debugging and only advances on confirmation', () => {
    const w = new Wizard();
    expect(w.step).toBe(Step.DEBUGGING);
    w.next();
    expect(w.step).toBe(Step.DEBUGGING);
    w.confirmDebugging();
    expect(w.step).toBe(Step.CHECK);
  });
  test('a ready TV skips device confirmation and install steps after next', () => {
    const w = new Wizard();
    w.confirmDebugging();
    w.checked(true);
    expect(w.completed).toBe(true);
    w.next();
    expect(w.step).toBe(Step.REPORT);
  });
  test('an unfinished TV goes through device, helper, control and activate in order', () => {
    const w = new Wizard();
    w.confirmDebugging();
    w.checked(false);
    w.next();
    expect(w.step).toBe(Step.DEVICE);
    w.chooseDevice();
    expect(w.step).toBe(Step.HELPER);
    expect(w.completed).toBe(false);
    w.next();
    expect(w.step).toBe(Step.HELPER);
    w.operationCompleted(); w.next();
    expect(w.step).toBe(Step.CONTROL);
    w.operationCompleted(); w.next();
    expect(w.step).toBe(Step.ACTIVATE);
    w.operationCompleted(); w.next();
    expect(w.step).toBe(Step.REPORT);
  });
  test('confirmTv only finishes when the fresh TV check passes', () => {
    const w = new Wizard();
    w.confirmDebugging(); w.checked(false); w.next(); w.chooseDevice();
    w.operationCompleted(); w.next();
    w.operationCompleted(); w.next();
    w.operationCompleted(); w.next();
    expect(w.step).toBe(Step.REPORT);
    w.confirmTv(false);
    expect(w.completed).toBe(false);
    w.next();
    expect(w.step).toBe(Step.REPORT);
    w.confirmTv(true);
    w.next();
    expect(w.step).toBe(Step.DONE);
  });
  test('device choice on an already-ready TV jumps straight to confirm', () => {
    const w = new Wizard();
    w.confirmDebugging(); w.checked(true); w.next();
    expect(w.step).toBe(Step.REPORT);
  });
  test('reset returns to debugging and clears readiness', () => {
    const w = new Wizard();
    w.confirmDebugging(); w.checked(true); w.next(); w.confirmTv(true); w.next();
    expect(w.step).toBe(Step.DONE);
    w.reset();
    expect(w.step).toBe(Step.DEBUGGING);
    expect(w.ready).toBe(false);
    expect(w.completed).toBe(false);
  });
  test('ready requires all four real checks', () => {
    expect(ready(true, true, true, true)).toBe(true);
    expect(ready(true, true, true, false)).toBe(false);
    expect(ready(true, false, true, true)).toBe(false);
  });
  test('validHost matches the phone validation', () => {
    expect(validHost('192.168.1.25')).toBe(true);
    expect(validHost('10.0.0.1')).toBe(true);
    expect(validHost('192.168.1.256')).toBe(false);
    expect(validHost('tv.local')).toBe(false);
    expect(validHost('')).toBe(false);
  });
});
