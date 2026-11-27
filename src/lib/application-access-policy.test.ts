// @ts-expect-error Bun supplies test types at runtime in this project.
import { describe, expect, it } from "bun:test";
import { applicationActionAllowed, freshSecondFactor, type ApplicationAccess } from "./application-access-policy";
const closed: ApplicationAccess = { screen: false, dashboard: false, portal: false, dashboardUntil: null, portalUntil: null };
describe("verified application locks", () => {
  it("blocks dashboard actions without a server grant", () => expect(applicationActionAllowed({ ...closed, screen: true }, "providerSetupLine")).toBe(false));
  it("blocks protected calls while the screen is locked", () => expect(applicationActionAllowed({ ...closed, dashboard: true, portal: true }, "listMyBoxes")).toBe(false));
  it("allows password recovery while locked", () => expect(applicationActionAllowed(closed, "verifyScreenLockPassword")).toBe(true));
  it("allows only PIN existence checks before unlock, not PIN disclosure", () => {
    expect(applicationActionAllowed(closed, "getMyStaffPinStatus")).toBe(true);
    expect(applicationActionAllowed(closed, "revealMyStaffPin")).toBe(false);
  });
  it("blocks portal credential reads without a verified code", () => expect(applicationActionAllowed({ ...closed, screen: true }, "readPortalCredentials")).toBe(false));
  it("allows verified portal reads", () => expect(applicationActionAllowed({ ...closed, screen: true, portal: true }, "readPortalCredentials")).toBe(true));
  it("rejects stale or forged second factor grants", () => {
    const now = 1_800_000_000_000;
    expect(freshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 61 }] }, now)).toBe(false);
    expect(freshSecondFactor({ aal: "aal1", amr: [{ method: "totp", timestamp: now / 1000 }] }, now)).toBe(false);
    expect(freshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 }] }, now)).toBe(true);
  });
});
