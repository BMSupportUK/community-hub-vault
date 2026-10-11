import { describe, expect, it } from "bun:test";
import {
  adminPanelLabel,
  adminPanelToolAllowed,
  canOpenAdminPanel,
} from "../src/lib/admin-panel-access";

const perms = {
  admin: ["admin", "management", "staff"],
  shifts: ["admin", "management", "staff"],
  "sports-guides": ["admin", "management", "moderator", "staff", "subscriber"],
  "admin-shifts": ["management"],
  "admin-dns": ["admin"],
  moderation: ["admin", "management"],
};

describe("admin panel header button", () => {
  it("reads Staff | Admin Panel for staff and management, Admin | Admin Panel for the owner", () => {
    expect(adminPanelLabel(["staff"])).toBe("Staff | Admin Panel");
    expect(adminPanelLabel(["management", "subscriber"])).toBe("Staff | Admin Panel");
    expect(adminPanelLabel(["admin", "staff"])).toBe("Admin | Admin Panel");
  });

  it("opens for staff, management and the owner only", () => {
    expect(canOpenAdminPanel(["staff"])).toBe(true);
    expect(canOpenAdminPanel(["management"])).toBe(true);
    expect(canOpenAdminPanel(["admin"])).toBe(true);
    expect(canOpenAdminPanel(["subscriber", "member"])).toBe(false);
    expect(canOpenAdminPanel(["moderator"])).toBe(false);
    expect(canOpenAdminPanel([])).toBe(false);
  });
});

describe("admin panel tool cards", () => {
  it("shows staff only the pages the permission list allows", () => {
    expect(adminPanelToolAllowed({ to: "/shifts" }, ["staff"], perms)).toBe(true);
    expect(adminPanelToolAllowed({ to: "/sports-guides" }, ["staff"], perms)).toBe(true);
    expect(adminPanelToolAllowed({ to: "/admin-shifts" }, ["staff"], perms)).toBe(false);
    expect(adminPanelToolAllowed({ to: "/moderation" }, ["staff"], perms)).toBe(false);
  });

  it("withholds staff cards until the permission list has loaded", () => {
    expect(adminPanelToolAllowed({ to: "/shifts" }, ["staff"], null)).toBe(false);
  });

  it("keeps owner-only tabs and owner-only tools away from staff", () => {
    expect(adminPanelToolAllowed({ tabKey: "theme" }, ["staff"], perms)).toBe(false);
    expect(adminPanelToolAllowed({ to: "/shop", adminOnly: true }, ["staff"], perms)).toBe(false);
    expect(adminPanelToolAllowed({ to: "/admin-dns" }, ["staff"], perms)).toBe(false);
  });

  it("leaves the owner's and management's cards untouched", () => {
    expect(adminPanelToolAllowed({ tabKey: "theme" }, ["admin"], perms)).toBe(true);
    expect(adminPanelToolAllowed({ to: "/admin-shifts" }, ["management"], perms)).toBe(true);
    expect(adminPanelToolAllowed({ tabKey: "sign-out-devices", managementToo: true }, ["management"], perms)).toBe(true);
    expect(adminPanelToolAllowed({ tabKey: "android-apk", adminOnly: true }, ["management"], perms)).toBe(false);
    expect(adminPanelToolAllowed({ to: "/shifts" }, ["management"], perms)).toBe(true);
  });
});
