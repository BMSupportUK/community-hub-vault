import { test, expect } from "bun:test";
import { customerDate } from "../src/lib/customer-date";

test("customer dates use UK day without hours or minutes", () => {
  expect(customerDate("2026-10-17T23:30:00Z")).toBe("18 Oct 2026");
  expect(customerDate("2026-12-25T09:02:00Z")).toBe("25 Dec 2026");
});