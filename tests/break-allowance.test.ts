import { test, expect } from "bun:test";
import { breaksLeft } from "../src/lib/breaks";

test("short breaks can be taken twice per shift", () => {
  expect(breaksLeft("break", [])).toBe(2);
  expect(breaksLeft("break", ["break"])).toBe(1);
  expect(breaksLeft("break", ["break", "lunch", "break"])).toBe(0);
});

test("lunch can be taken once per shift", () => {
  expect(breaksLeft("lunch", [])).toBe(1);
  expect(breaksLeft("lunch", ["lunch"])).toBe(0);
});
