// @ts-nocheck
import { expect, test } from "bun:test";
import { panelError } from "./provider-panel.server";
test("ignores the renew form's built-in IP and user-agent toasts", () => {
  const html = `$.toast("Please enter a valid IP address."); $.toast("Please enter a user-agent.");`;
  expect(panelError(html)).toBeNull();
});
test("still reports a real panel message", () => {
  expect(panelError(`$.toast("Please enter a valid IP address."); $.toast("Not enough credits")`)).toBe("Not enough credits");
});
