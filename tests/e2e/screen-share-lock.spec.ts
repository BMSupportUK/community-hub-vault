import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

test("staff lock conceals an active order share without closing its peers", async ({ page }) => {
  const sessionPath = join(homedir(), ".cache/lovable-auth/session.json");
  test.skip(!existsSync(sessionPath), "Requires a locally minted staff test session");
  const session = JSON.parse(readFileSync(sessionPath, "utf8"));
  await page.goto("/");
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [session.storage_key, JSON.stringify(session.session)]);
  await page.goto(`/screen-share/order/${process.env.E2E_SCREEN_SHARE_ORDER_ID ?? "184631a7-c670-45f2-b6f6-1a5e9f67e90c"}`);
  await expect(page.locator("video")).toHaveCount(1);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const state = window as typeof window & { shareVideo?: HTMLVideoElement | null; peerCloses?: number };
    state.shareVideo = document.querySelector("video");
    state.peerCloses = 0;
    const close = RTCPeerConnection.prototype.close;
    RTCPeerConnection.prototype.close = function () {
      state.peerCloses = (state.peerCloses ?? 0) + 1;
      return close.call(this);
    };
    window.dispatchEvent(new Event("app:screen-lock-now"));
  });
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();
  await expect(page.locator("video")).toBeHidden();
  await page.waitForTimeout(5000);
  const result = await page.evaluate(() => {
    const state = window as typeof window & { shareVideo?: HTMLVideoElement | null; peerCloses?: number };
    return {
      sameVideo: state.shareVideo === document.querySelector("video") && state.shareVideo?.isConnected,
      inert: Boolean(state.shareVideo?.closest("[inert][hidden][aria-hidden='true']")),
      peerCloses: state.peerCloses,
    };
  });
  expect(result).toEqual({ sameVideo: true, inert: true, peerCloses: 0 });
});