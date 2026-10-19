import { describe, expect, it } from "bun:test";
import {
  adminPanelLabel,
  adminPanelToolAllowed,
  canOpenAdminPanel,
  staffAllowedPageKeys,
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

  it("ignores Boro Fan Zone roles on the BM Support dashboard", () => {
    const p = { "admin-fan-zone": ["admin", "boro_fan_zone_moderator"] };
    expect(adminPanelToolAllowed({ to: "/admin-fan-zone" }, ["staff", "boro_fan_zone_moderator"], p)).toBe(false);
  });

  it("adds cards only for admin tool pages ticked for staff, never normal pages", () => {
    const p = {
      admin: ["staff"],
      tickets: ["staff", "member"],
      members: ["staff"],
      shifts: ["staff"],
      forum: ["boro_fan_zone_moderator", "staff"],
      "admin-dns": ["admin"],
      "admin-blacklist": ["staff"],
    };
    const keys = staffAllowedPageKeys(["staff", "boro_fan_zone_moderator"], p, new Set(["shifts"]), (k) => k === "forum");
    expect(keys.sort()).toEqual(["admin-blacklist"]);
    expect(staffAllowedPageKeys(["admin"], p, new Set(), () => false)).toEqual([]);
  });
});

import { canOpenFanZoneAdminPanel as fzOpen, fanZoneToolAllowed as fzTool } from "../src/lib/admin-panel-access";
describe("Fan Zone dashboard is not for BM Support staff", () => {
  const perms = { "admin-fan-zone": ["admin", "management", "staff", "boro_fan_zone_moderator"] };
  it("staff and management cannot open it", () => {
    expect(fzOpen(["staff"])).toBe(false);
    expect(fzOpen(["management"])).toBe(false);
  });
  it("owner and Fan Zone moderators can", () => {
    expect(fzOpen(["admin"])).toBe(true);
    expect(fzOpen(["boro_fan_zone_moderator"])).toBe(true);
  });
  it("ticked staff/management roles never show Fan Zone cards", () => {
    expect(fzTool({ to: "/admin-fan-zone" }, ["management"], perms)).toBe(false);
    expect(fzTool({ to: "/admin-fan-zone" }, ["staff"], perms)).toBe(false);
    expect(fzTool({ to: "/admin-fan-zone" }, ["boro_fan_zone_moderator"], perms)).toBe(true);
  });
});

