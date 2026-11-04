import { expect, test } from "bun:test";
import { memberEmailError, memberEmailSchema } from "../src/lib/member-email-validation";

test("email entry rejects extra words without silently changing the address", () => {
  expect(memberEmailSchema.safeParse("charmj82168@gmail.com babe").success).toBe(false);
  expect(memberEmailError("charmj82168@gmail.com babe")).not.toBeNull();
});

test("email entry accepts the intended address and surrounding whitespace", () => {
  expect(memberEmailSchema.parse(" Charmj82168@gmail.com ")).toBe("charmj82168@gmail.com");
  expect(memberEmailError("charmj82168@gmail.com")).toBeNull();
});