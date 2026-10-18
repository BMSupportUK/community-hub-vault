import { describe, expect, it } from "bun:test";
import { sortCustomers, type SortableCustomer } from "./customer-sort";

const c = (over: Partial<SortableCustomer> & { username: string }): SortableCustomer => ({
  displayName: null,
  referrerName: null,
  renewedAt: null,
  firstSubscriptionAt: null,
  accounts: [],
  noRenewal: false,
  ...over,
});

describe("sortCustomers", () => {
  it("sorts expiry oldest to newest", () => {
    const rows = [
      c({ username: "b", accounts: [{ expiresAt: "2027-05-01" }] }),
      c({ username: "a", accounts: [{ expiresAt: "2026-01-01" }] }),
      c({ username: "c", accounts: [{ expiresAt: "2026-12-31" }] }),
    ];
    expect(sortCustomers(rows, "expires", "asc").map((r) => r.username)).toEqual(["a", "c", "b"]);
  });

  it("sorts expiry newest to oldest", () => {
    const rows = [
      c({ username: "a", accounts: [{ expiresAt: "2026-01-01" }] }),
      c({ username: "b", accounts: [{ expiresAt: "2027-05-01" }] }),
    ];
    expect(sortCustomers(rows, "expires", "desc").map((r) => r.username)).toEqual(["b", "a"]);
  });

  it("puts missing values last in both directions", () => {
    const rows = [
      c({ username: "missing", accounts: [{ expiresAt: null }] }),
      c({ username: "old", accounts: [{ expiresAt: "2026-01-01" }] }),
    ];
    expect(sortCustomers(rows, "expires", "asc").map((r) => r.username)).toEqual(["old", "missing"]);
    expect(sortCustomers(rows, "expires", "desc").map((r) => r.username)).toEqual(["old", "missing"]);
  });

  it("treats No Renewal Yet customers as missing for renewal sort", () => {
    const rows = [
      c({ username: "norenewal", noRenewal: true, renewedAt: "2026-10-01" }),
      c({ username: "renewed", renewedAt: "2026-09-01" }),
    ];
    expect(sortCustomers(rows, "renewed", "asc").map((r) => r.username)).toEqual(["renewed", "norenewal"]);
  });

  it("sorts names A to Z and Z to A", () => {
    const rows = [c({ username: "carl" }), c({ username: "anna" }), c({ username: "ben" })];
    expect(sortCustomers(rows, "name", "asc").map((r) => r.username)).toEqual(["anna", "ben", "carl"]);
    expect(sortCustomers(rows, "name", "desc").map((r) => r.username)).toEqual(["carl", "ben", "anna"]);
  });

  it("default order returns rows unchanged", () => {
    const rows = [c({ username: "z" }), c({ username: "a" })];
    expect(sortCustomers(rows, "default", "asc")).toBe(rows);
  });
});
