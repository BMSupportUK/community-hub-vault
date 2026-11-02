import { describe, expect, test } from "bun:test";
import { manualPlayerLogin, selectedPlayerLogin, type SavedPlayerLogin } from "../src/components/app/player-login-selection";

const accounts: SavedPlayerLogin[] = [
  { id: "one", app_login_name: "first-login", password: "first-password", expiry_at: null, account_type: "single", account_number: 1 },
  { id: "two", app_login_name: "second-login", password: "second-password", expiry_at: null, account_type: "multi", account_number: 2 },
];

describe("saved BM Player login selection", () => {
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