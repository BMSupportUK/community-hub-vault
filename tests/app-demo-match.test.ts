import { describe, expect, it } from "bun:test";
import { findAppDemo } from "../src/lib/app-demo-match";

const demos = [
  { app_name: "XCTV", title: "XCTV" },
  { app_name: "QD App", title: "QD App" },
  { app_name: null, title: "BM Smart Player V5" },
];

describe("install app demo matching", () => {
  it("matches the renamed QD install app", () => {
    expect(findAppDemo("QD Official Service App", demos)).toBe(demos[1]);
  });
  it("matches BM XC to its XCTV demo", () => {
    expect(findAppDemo("BM XC Offical 3rd Party", demos)).toBe(demos[0]);
  });
  it("matches Smart Player using a title when app_name is missing", () => {
    expect(findAppDemo("Smart Player 3rd Party Rebrand", demos)).toBe(demos[2]);
  });
  it("does not give an unrelated app a different app's demo", () => {
    expect(findAppDemo("Netmirror", demos)).toBeUndefined();
    expect(findAppDemo("BM Tivi 3rd Party Rebrand", demos)).toBeUndefined();
    expect(findAppDemo("", demos)).toBeUndefined();
  });
});