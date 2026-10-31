import { expect, test } from "bun:test";
import { adminInstallerCodeSchema, adminInstallerPinTtl, requireAdminInstallerAccess } from "../src/lib/admin-installer-code";
import { handoffUsable } from "../src/lib/enabler-handoff";

const valid = { name: "Demo TV", device: "amazon", purpose: "install", installer: "direct", appPaths: ["/api/public/tv-install-apk/11111111-1111-1111-1111-111111111111"] };
test("a reference name is required", () => { expect(adminInstallerCodeSchema.safeParse({ ...valid, name: " " }).success).toBe(false); expect(adminInstallerCodeSchema.parse(valid).name).toBe("Demo TV"); });
test("a device selection is required", () => { expect(adminInstallerCodeSchema.safeParse({ ...valid, device: null }).success).toBe(false); expect(adminInstallerCodeSchema.parse({ ...valid, device: "android" }).device).toBe("android"); });
test("at least one installer app must be chosen", () => { expect(adminInstallerCodeSchema.safeParse({ ...valid, appPaths: [] }).success).toBe(false); expect(adminInstallerCodeSchema.parse(valid).appPaths).toEqual(valid.appPaths); });
test("Direct Install PINs last 30 minutes independently of Enabler PINs", () => { expect(adminInstallerPinTtl("direct")).toBe(30 * 60 * 1000); expect(adminInstallerPinTtl("enabler")).toBe(24 * 60 * 60 * 1000); });
test("Direct Install cannot issue screen sharing", () => { expect(adminInstallerCodeSchema.safeParse({ ...valid, purpose: "support" }).success).toBe(false); });
test("only admin and management can request installer codes", async () => {
  for (const role of ["admin", "management", "staff", "member"]) {
    const sb = { rpc: async (_: string, args: { _role: string }) => ({ data: args._role === role }) };
    if (role === "admin" || role === "management") await expect(requireAdminInstallerAccess(sb, "verified-user")).resolves.toBeUndefined();
    else await expect(requireAdminInstallerAccess(sb, "verified-user")).rejects.toThrow("Only admin and management");
  }
});
test("issued website code is restricted to its paired PIN", () => {
  const row = { user_id: "admin", expires_at: new Date(10000).toISOString(), used_at: null, admin_issue_id: "issue-a" };
  expect(handoffUsable(row, null, 0, "issue-a")).toBe("ok");
  expect(handoffUsable(row, "admin", 0, "issue-b")).toBe("wrong_user");
  expect(handoffUsable(row, "admin", 0)).toBe("wrong_user");
});