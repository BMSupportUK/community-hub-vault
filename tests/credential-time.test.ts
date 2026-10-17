import { describe, expect, test } from "bun:test";
import { CREDENTIAL_TIME_STEP, credentialTimeInput, formatCredentialTime } from "../src/lib/credential-time";

describe("credential time precision", () => {
  test("entry accepts one-minute increments, not seconds", () => {
    expect(CREDENTIAL_TIME_STEP).toBe(60);
    expect(credentialTimeInput("2026-10-17T13:03:47.123")).toBe("2026-10-17T13:03");
    expect(credentialTimeInput("")).toBe("");
  });

  test("credential details display hours and minutes without seconds", () => {
    expect(formatCredentialTime(new Date(2026, 9, 17, 13, 3, 47))).toBe("17 Oct 2026, 13:03");
  });
});