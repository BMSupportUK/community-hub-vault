import { expect, test } from "bun:test";
import { assertMemberDetailsAccess, canEditMemberDetails } from "../src/lib/member-details-access";

test("only admin may edit every staff role from Customers", async () => {
  for (const targetRole of ["admin", "management", "staff", "moderator"]) {
    expect(canEditMemberDetails(["admin"], [targetRole])).toBe(true);
    for (const callerRole of ["management", "staff", "moderator", "member"]) {
      expect(canEditMemberDetails([callerRole], [targetRole])).toBe(false);
      await expect(assertMemberDetailsAccess([callerRole], async () => [targetRole])).rejects.toThrow();
    }
    await expect(assertMemberDetailsAccess(["admin"], async () => [targetRole])).resolves.toBeUndefined();
  }
});

test("existing management editing of non-staff customers stays available", () => {
  expect(canEditMemberDetails(["management"], ["member", "subscriber"])).toBe(true);
  expect(canEditMemberDetails(["member"], ["member"])).toBe(false);
});

test("staff protection includes mixed roles and fails closed on lookup errors", async () => {
  expect(canEditMemberDetails(["management"], ["member", "staff"])).toBe(false);
  await expect(assertMemberDetailsAccess(["management"], async () => { throw new Error("Lookup failed"); })).rejects.toThrow("Lookup failed");
});