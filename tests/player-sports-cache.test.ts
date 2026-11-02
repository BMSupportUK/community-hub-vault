import { describe, expect, test } from "bun:test";
import { createSharedCache } from "../src/lib/player-sports-cache";

describe("sports guide shared cache", () => {
  test("many requests within 60 seconds load once", async () => {
    let t = 0, loads = 0;
    const c = createSharedCache<number>(60_000, () => t);
    const load = async () => ++loads;
    await Promise.all(Array.from({ length: 500 }, () => c(load)));
    t = 59_000; await c(load);
    expect(loads).toBe(1);
  });
  test("reloads after 60 seconds", async () => {
    let t = 0, loads = 0;
    const c = createSharedCache<number>(60_000, () => t);
    await c(async () => ++loads);
    t = 60_000;
    expect(await c(async () => ++loads)).toBe(2);
  });
});
