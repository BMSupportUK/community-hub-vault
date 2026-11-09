import { describe, expect, test } from "bun:test";
import { devicesForPlayerLogin, manualPlayerLogin, selectedPlayerLogin, type SavedPlayerLogin } from "../src/components/app/player-login-selection";

const accounts: SavedPlayerLogin[] = [
  { id: "one", app_login_name: "first-login", password: "first-password", expiry_at: null, account_type: "single", account_number: 1 },
  { id: "two", app_login_name: "second-login", password: "second-password", expiry_at: null, account_type: "multi", account_number: 2 },
];

describe("saved BM Player login selection", () => {
  test("each login shows only devices stored against that account", () => {
    const devices = [
      { id: "first-box", credential_id: "one", iptv_username: "first-login" },
      { id: "second-box", credential_id: "two", iptv_username: "second-login" },
      { id: "legacy-second", credential_id: null, iptv_username: "second-login" },
      { id: "unassigned", credential_id: null, iptv_username: null },
      { id: "conflicting", credential_id: "one", iptv_username: "second-login" },
    ];
    expect(devicesForPlayerLogin(devices, accounts[1]).map((device) => device.id)).toEqual(["second-box", "legacy-second"]);
    expect(devicesForPlayerLogin(devices, accounts[0]).map((device) => device.id)).toEqual(["first-box", "conflicting"]);
  });
  test("sends only the ticked login when multiple logins exist", () => {
    expect(selectedPlayerLogin(accounts, "two")).toEqual({ username: "second-login", password: "second-password" });
  });
  test("requires an explicit tick before sending", () => {
    expect(selectedPlayerLogin(accounts, null)).toBeNull();
  });
  test("cannot send a login outside the loaded subscriber accounts", () => {
    expect(selectedPlayerLogin(accounts, "someone-else")).toBeNull();
  });
});

describe("typed-in BM Player login", () => {
  test("sends a login typed in by hand", () => {
    expect(manualPlayerLogin("  typed-login ", "typed-password")).toEqual({ username: "typed-login", password: "typed-password" });
  });
  test("needs both a login and a password", () => {
    expect(manualPlayerLogin("", "typed-password")).toBeNull();
    expect(manualPlayerLogin("   ", "typed-password")).toBeNull();
    expect(manualPlayerLogin("typed-login", "")).toBeNull();
  });
});
