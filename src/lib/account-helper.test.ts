// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { accountHelperWelcome, showHelperButtons, skipOutOfHours } from "./account-helper";

const welcome = { content: accountHelperWelcome("https://x"), is_internal: false };
const base = { slug: "account", status: "open", isOwner: true, messages: [welcome] };

describe("Forgot Account Login helper", () => {
  test("no out-of-hours notice on account tickets only", () => {
    expect(skipOutOfHours("account")).toBe(true);
    expect(skipOutOfHours("general")).toBe(false);
  });
  test("welcome links to Service Credentials", () => { expect(welcome.content).toContain("https://x/portal/logins"); });
  test("buttons show after the helper prompt", () => { expect(showHelperButtons(base)).toBe(true); });
  test("typed reply hands to staff (buttons hide)", () => {
    expect(showHelperButtons({ ...base, messages: [welcome, { content: "help", is_internal: false }] })).toBe(false);
  });
  test("internal notes don't hide buttons", () => {
    expect(showHelperButtons({ ...base, messages: [welcome, { content: "note", is_internal: true }] })).toBe(true);
  });
  test("not for staff, other categories or closed tickets", () => {
    expect(showHelperButtons({ ...base, isOwner: false })).toBe(false);
    expect(showHelperButtons({ ...base, slug: "general" })).toBe(false);
    expect(showHelperButtons({ ...base, status: "closed" })).toBe(false);
  });
});
