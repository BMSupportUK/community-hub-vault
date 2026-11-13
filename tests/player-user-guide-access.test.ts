import { expect, test } from "bun:test";
import { customerActionAllowed } from "../src/lib/profile-access";

test("customer profiles can open protected BM Player guides", () => {
  expect(customerActionAllowed("openPlayerUserGuide")).toBe(true);
  expect(customerActionAllowed("uploadPlayerUserGuide")).toBe(false);
});