import { describe, expect, test } from "bun:test";
import { nextDirectStep } from "@/lib/direct-install";

/** reported[] from the wizard: [answered, link-or-download, downloaded, signedIn, permission, code]. */
const reports = (n: number) => [false, n > 1, n > 2, n > 3, n > 4, n > 5];

describe("BM Direct Install wizard auto-advance", () => {
  test("Start again stays on the first question even when a download link exists", () => {
    expect(nextDirectStep([false, true, false, false, false, false], false, 0)).toBe(0);
  });
  test("already installed remains on PIN until the TV reports progress", () => {
    expect(nextDirectStep([false, false, false, false, false, false], true, 3)).toBe(3);
  });
  test("allowing unknown apps moves the wizard straight to the website-code step", () => {
    expect(nextDirectStep(reports(5), false, 4)).toBe(5);
  });
  test("the TV's sign-in report moves the wizard to the PIN step while you're still on the link step", () => {
    expect(nextDirectStep(reports(4), false, 2)).toBe(4);
  });
  test("the already-installed path advances without a download or link being reported", () => {
    expect(nextDirectStep([false, false, false, true, true, false], true, 3)).toBe(5);
  });
  test("stays put while the TV has reported nothing new", () => {
    expect(nextDirectStep([false, false, false, false, false, false], false, 2)).toBe(2);
    expect(nextDirectStep(reports(5), false, 5)).toBe(5);
  });
  test("never sends the wizard backwards", () => {
    expect(nextDirectStep(reports(3), false, 5)).toBe(5);
  });
});
