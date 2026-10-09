import { describe, expect, test } from "bun:test";
import { matchesOpponent } from "../src/lib/boro-press-conference.server";

describe("press conference opponent matching", () => {
  test("'Wolves' title matches Wolverhampton Wanderers", () => {
    expect(matchesOpponent("Press Conference | Wolves", "Wolverhampton Wanderers")).toBe(true);
  });
  test("other clubs' press conferences do not match Wolves", () => {
    expect(matchesOpponent("Press Conference | Birmingham", "Wolverhampton Wanderers")).toBe(false);
  });
});
