import { expect, test } from "bun:test";
import { getSeason } from "../src/lib/seasonal-theme";

test("mid October is Halloween", () => expect(getSeason(new Date("2026-10-15T12:00:00Z"))).toBe("halloween"));
test("31 Oct 23:30 UK is still Halloween", () => expect(getSeason(new Date("2026-10-31T23:30:00Z"))).toBe("halloween"));
test("1 November has no season", () => expect(getSeason(new Date("2026-11-01T12:00:00Z"))).toBeNull());
test("1 December is Christmas", () => expect(getSeason(new Date("2026-12-01T00:30:00Z"))).toBe("christmas"));
test("31 December is Christmas", () => expect(getSeason(new Date("2026-12-31T22:00:00Z"))).toBe("christmas"));
test("1 January has no season", () => expect(getSeason(new Date("2027-01-01T12:00:00Z"))).toBeNull());
