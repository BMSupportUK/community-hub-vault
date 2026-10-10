import { test, expect } from "bun:test";
import { claimBreakAlert } from "../src/lib/break-alerts";

test("lunch warning and expiry produce only one popup and sound", () => {
  const seen = new Set<string>();
  expect(claimBreakAlert("lunch-1", seen)).toBe(true);
  expect(claimBreakAlert("lunch-1", seen)).toBe(false);
  expect(claimBreakAlert("lunch-2", seen)).toBe(true);
});

test("reload or lock remount cannot replay a delivered break alert", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
  expect(claimBreakAlert("lunch-1", new Set(), storage)).toBe(true);
  expect(claimBreakAlert("lunch-1", new Set(), storage)).toBe(false);
});