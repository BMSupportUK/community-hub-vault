// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { pickConnections } from "./player-connections";

test("provider's connection number wins over the website package", () => {
  expect(pickConnections(2, 1, null)).toBe(2);
});
test("package is used when the provider can't be reached", () => {
  expect(pickConnections(null, 3, 1)).toBe(3);
});
test("app-reported number is the last fallback", () => {
  expect(pickConnections(null, null, 2)).toBe(2);
  expect(pickConnections(0, null, null)).toBe(null);
});
test("a Multi Room package keeps 2 connections when the provider reports 1", () => {
  expect(pickConnections(1, 2, null)).toBe(2);
  expect(pickConnections(1, 3, 1)).toBe(3);
});
test("a provider's huge 'unlimited' number is ignored, so the package decides", () => {
  expect(pickConnections(315368056, 1, null)).toBe(1);
  expect(pickConnections(315368056, null, null)).toBe(null);
});
