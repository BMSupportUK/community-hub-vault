import { expect, test } from "bun:test";
import { getSeason } from "../src/lib/seasonal-theme";

test("mid October is Halloween", () => expect(getSeason(new Date("2026-10-15T12:00:00Z"))).toBe("halloween"));
test("31 Oct 23:30 UK is still Halloween", () => expect(getSeason(new Date("2026-10-31T23:30:00Z"))).toBe("halloween"));
test("1 November has no season", () => expect(getSeason(new Date("2026-11-01T12:00:00Z"))).toBeNull());
test("1 December is Christmas", () => expect(getSeason(new Date("2026-12-01T00:30:00Z"))).toBe("christmas"));
test("31 December is Christmas", () => expect(getSeason(new Date("2026-12-31T22:00:00Z"))).toBe("christmas"));
test("New Year’s Day is only 1 January in UK time", () => {
  expect(getSeason(new Date("2026-12-31T23:59:59Z"))).toBe("christmas");
  expect(getSeason(new Date("2027-01-01T00:00:00Z"))).toBe("new-year");
  expect(getSeason(new Date("2027-01-01T23:59:59Z"))).toBe("new-year");
  expect(getSeason(new Date("2027-01-02T00:00:00Z"))).toBeNull();
});

test("St George’s Day is only 23 April in UK time, including BST", () => {
  expect(getSeason(new Date("2027-04-22T22:59:59Z"))).toBeNull();
  expect(getSeason(new Date("2027-04-22T23:00:00Z"))).toBe("st-george");
  expect(getSeason(new Date("2027-04-23T22:59:59Z"))).toBe("st-george");
  expect(getSeason(new Date("2027-04-23T23:00:00Z"))).toBeNull();
});

test("Bonfire Night is only 5 November in UK time", () => {
  expect(getSeason(new Date("2026-11-04T23:59:59Z"))).toBeNull();
  expect(getSeason(new Date("2026-11-05T00:00:00Z"))).toBe("bonfire");
  expect(getSeason(new Date("2026-11-05T23:59:59Z"))).toBe("bonfire");
  expect(getSeason(new Date("2026-11-06T00:00:00Z"))).toBeNull();
});
test("Easter 2026 is only 5 April in UK time", () => {
  expect(getSeason(new Date("2026-04-04T22:59:59Z"))).toBeNull();
  expect(getSeason(new Date("2026-04-04T23:00:00Z"))).toBe("easter");
  expect(getSeason(new Date("2026-04-05T22:59:59Z"))).toBe("easter");
  expect(getSeason(new Date("2026-04-05T23:00:00Z"))).toBeNull();
});
test("Easter moves annually: 2027 is 28 March, not April", () => {
  expect(getSeason(new Date("2027-03-28T00:00:00Z"))).toBe("easter");
  expect(getSeason(new Date("2027-03-28T22:59:59Z"))).toBe("easter");
  expect(getSeason(new Date("2027-03-28T23:00:00Z"))).toBeNull();
  expect(getSeason(new Date("2027-04-05T12:00:00Z"))).toBeNull();
});
