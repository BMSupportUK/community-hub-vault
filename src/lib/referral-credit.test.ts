// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { referralCreditForPackage } from "./referral-credit";
test("single 12 month earns £5", () => { expect(referralCreditForPackage("BM Support Digital Service 12 Month Package")).toBe(500); });
test("multi room earns £9", () => { expect(referralCreditForPackage("BM Support Digital Service 12 Months | Multi Room")).toBe(900); });
test("triple room earns £13", () => { expect(referralCreditForPackage("BM Support Digital Service 12 Months | Triple Room")).toBe(1300); });
test("6 month earns nothing", () => { expect(referralCreditForPackage("BM Support Digital Service 6 Months | Single User")).toBe(0); });
test("1 month earns nothing", () => { expect(referralCreditForPackage("BM Support Digital Service 1 Month | Single User")).toBe(0); });
