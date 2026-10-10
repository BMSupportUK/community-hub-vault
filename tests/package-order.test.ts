import { test, expect } from "bun:test";
import { comparePackages, packageSortKey } from "../src/lib/package-order";

const NAMES = [
  "BM Support Digital Service 12 Months | Triple Room",
  "BM Support Digital Service 1 Month | Single User",
  "BM Support Digital Service 12 Month Package",
  "BM Support Digital Service 12 Months | Multi Room",
  "BM Support Digital Service 6 Months | Single User",
];

test("packages list single 12, single 6, single 1 month, then Multi Room, then Triple Room", () => {
  expect([...NAMES].sort(comparePackages)).toEqual([
    "BM Support Digital Service 12 Month Package",
    "BM Support Digital Service 6 Months | Single User",
    "BM Support Digital Service 1 Month | Single User",
    "BM Support Digital Service 12 Months | Multi Room",
    "BM Support Digital Service 12 Months | Triple Room",
  ]);
});

test("a package with no room or month in its name sorts after the known ones", () => {
  const sorted = [...NAMES, "BM Support Digital Service Lifetime"].sort(comparePackages);
  expect(sorted[0]).toBe("BM Support Digital Service 12 Month Package");
  expect(sorted[sorted.length - 1]).toBe("BM Support Digital Service Lifetime");
});

test("month counts are read from the name, not confused with 12", () => {
  expect(packageSortKey("BM Support Digital Service 1 Month | Single User").months).toBe(1);
  expect(packageSortKey("BM Support Digital Service 12 Month Package").months).toBe(12);
  expect(packageSortKey("BM Support Digital Service 6 Months | Single User").months).toBe(6);
});
