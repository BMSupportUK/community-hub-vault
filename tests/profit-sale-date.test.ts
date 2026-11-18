import { expect, test } from "bun:test";
import { profitSaleAt } from "../src/components/app/ProfitCostsPanel";
test("early renewal profit lands on the day it was paid, not its future start date", () => {
  expect(profitSaleAt({ created_at: "2027-01-03T11:17:04Z", paid_at: "2026-11-18T11:17:18Z" })).toBe("2026-11-18T11:17:18Z");
  expect(profitSaleAt({ created_at: "2026-10-01T10:00:00Z", paid_at: null })).toBe("2026-10-01T10:00:00Z");
});
