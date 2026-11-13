// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { spokenName, welcomeAllowed, welcomeText } from "./player-welcome-voice";

describe("welcome voice", () => {
  test("greets the customer by username", () => {
    expect(welcomeText("DaneJ")).toBe("Welcome to BM Player, Dane J. Your device is linked. Enjoy watching.");
  });
  test("usernames are spoken as natural words", () => {
    expect(spokenName("DaneJ2024")).toBe("Dane J 2024");
    expect(spokenName("john_smith")).toBe("john smith");
    expect(spokenName("TVBox-2")).toBe("TVBox 2");
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
