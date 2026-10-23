import { describe, expect, test } from "bun:test";
import { canForwardRemote } from "../src/lib/tv-remote";

describe("remote control: only the controlling staff member", () => {
  test("commands from the controller are forwarded", () => {
    expect(canForwardRemote("staff-a", "staff-a")).toBe(true);
  });
  test("commands from a watching staff member are dropped", () => {
    expect(canForwardRemote("staff-a", "staff-b")).toBe(false);
  });
  test("no controller means nothing is forwarded", () => {
    expect(canForwardRemote(null, "staff-a")).toBe(false);
  });
});
