// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { isBackupApp } from "./backup-apps";

test("QD and XCTV install cards are backup apps, not BM Player", () => {
  expect(isBackupApp({ appName: "QD Official Service App" })).toBe(true);
  expect(isBackupApp({ appName: "BM XC Offical 3rd Party" })).toBe(true);
  expect(isBackupApp({ appName: "XCTV" })).toBe(true);
  expect(isBackupApp({ appName: "BM Player Offical App" })).toBe(false);
  expect(isBackupApp({ appName: "Smart Player 3rd Party Rebrand" })).toBe(false);
});