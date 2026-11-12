import { describe, expect, test } from "bun:test";
import { welcomeAllowed, welcomeText } from "./player-welcome-voice";

describe("welcome voice", () => {
  test("greets the customer by username", () => {
    expect(welcomeText("DaneJ")).toBe("Welcome to BM Player, DaneJ. Your device is linked. Enjoy watching.");
  });
  test("no username gives a nameless greeting", () => {
    expect(welcomeText(null)).toBe("Welcome to BM Player. Your device is linked. Enjoy watching.");
  });
  test("only once per device within 30 seconds", () => {
    expect(welcomeAllowed("dev-a", 1000)).toBe(true);
    expect(welcomeAllowed("dev-a", 5000)).toBe(false);
    expect(welcomeAllowed("dev-a", 40_000)).toBe(true);
  });
});
