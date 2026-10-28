// @ts-nocheck — tests run with bun test.
import { expect, test } from "bun:test";
import { ticketSetupStage } from "./ticket-setup-stage";
const initial = { loggedIn: false, handedOff: false, tvConnected: false, ready: false, canConnect: false, completed: false, linked: false };
test("confirmed stages advance without instruction clicks verifying the TV", () => {
  expect(ticketSetupStage(initial)).toBe(1);
  expect(ticketSetupStage({ ...initial, loggedIn: true })).toBe(2);
  expect(ticketSetupStage({ ...initial, loggedIn: true, handedOff: true })).toBe(3);
  expect(ticketSetupStage({ ...initial, tvConnected: true })).toBe(4);
  expect(ticketSetupStage({ ...initial, ready: true })).toBe(4);
  expect(ticketSetupStage({ ...initial, canConnect: true })).toBe(5);
  expect(ticketSetupStage({ ...initial, completed: true })).toBe(6);
});
test("a fresh connection remains available after an older completed session", () => {
  expect(ticketSetupStage({ ...initial, completed: true, canConnect: true })).toBe(5);
});