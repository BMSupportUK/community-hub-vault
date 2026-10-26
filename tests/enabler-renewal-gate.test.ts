import { expect, test } from "bun:test";
import { RenewalRequestGate, RENEWAL_WAIT_MS } from "../src/lib/enabler-renewal";

test("pressing Get new connection immediately blocks repeat requests while queued", () => {
  const gate = new RenewalRequestGate();
  expect(gate.begin("old", 1000)).toBe(true);
  expect(gate.begin("old", 1001)).toBe(false);
  gate.finish("queued");
  gate.sync(null, 2000);
  expect(gate.waiting(2000)).toBe(true);
  expect(gate.begin(null, 2001)).toBe(false);
});
test("the replacement connection clears the waiting lock, not the old session", () => {
  const gate = new RenewalRequestGate();
  gate.begin("old", 1000);
  gate.sync("old", 2000);
  expect(gate.waiting(2000)).toBe(true);
  gate.sync("fresh", 2000);
  expect(gate.waiting(2000)).toBe(false);
});
test("failed and timed-out requests allow retry", () => {
  const gate = new RenewalRequestGate();
  gate.begin(null, 1000);
  gate.finish("failed");
  expect(gate.begin(null, 2000)).toBe(true);
  expect(gate.begin(null, 2000 + RENEWAL_WAIT_MS)).toBe(true);
});