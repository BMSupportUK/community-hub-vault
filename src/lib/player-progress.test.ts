// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { test, expect } from "bun:test";
import { newerThanStored } from "./player-progress";

const item = (key: string, at: number, pos = 1000) => ({ key, position_ms: pos, duration_ms: 9000, updated_at: at });

test("newest position wins over the stored one", () => {
  const stored = [{ item_key: "film:1", updated_at: new Date(2000).toISOString() }];
  expect(newerThanStored([item("film:1", 1000)], stored)).toEqual([]);
  expect(newerThanStored([item("film:1", 3000, 5)], stored)).toEqual([item("film:1", 3000, 5)]);
});
test("duplicates in one batch keep the latest, live/catch up keys are refused", () => {
  expect(newerThanStored([item("episode:9", 1, 1), item("episode:9", 5, 2), item("live:3", 9), item("catchup:4", 9)], []))
    .toEqual([item("episode:9", 5, 2)]);
});
