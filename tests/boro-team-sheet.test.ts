import { describe, expect, it } from "vitest";
import { isOwnTeamSheetText, isTeaserText, normalizeFancyText } from "@/lib/boro-team-sheet.server";

describe("isOwnTeamSheetText", () => {
  it("recognises Stoke's colour-nickname team news post", () => {
    expect(isOwnTeamSheetText("Your red and whites under the lights 🚦 https://t.co/pvxPVGoWsm")).toBe(
      true,
    );
  });

  it("still recognises the established phrasings", () => {
    expect(isOwnTeamSheetText("How we line-up to face @Boro 📋")).toBe(true);
    expect(isOwnTeamSheetText(normalizeFancyText("𝙏𝙀𝘼𝙈 𝙉𝙀𝙒𝙎 🔵"))).toBe(true);
    expect(isOwnTeamSheetText("Tonight's starting XI 🔵")).toBe(true);
  });

  it("recognises plain colour nicknames", () => {
    expect(isOwnTeamSheetText("Your Whites for tonight's trip")).toBe(true);
    expect(isOwnTeamSheetText("Your Reds at the bet365 Stadium")).toBe(true);
  });

  it("rejects non-team-sheet posts from the same account", () => {
    expect(
      isOwnTeamSheetText(
        "A major milestone in the red and white 🔴⚪️ Ben Wilmot joins an exclusive list of Potters' double centurions",
      ),
    ).toBe(false);
    expect(
      isOwnTeamSheetText(
        "Supporters are advised a pre-match lightshow will precede tonight's ST4 showdown 🚥",
      ),
    ).toBe(false);
  });

  it("never treats academy or women's posts as a team sheet", () => {
    expect(isOwnTeamSheetText("Your red and whites — U21s line-up announced")).toBe(false);
    expect(isOwnTeamSheetText("Your blues in action — women's team news")).toBe(false);
  });

  it("teaser posts stay rejected", () => {
    expect(isTeaserText("Team news coming shortly")).toBe(true);
  });
});
