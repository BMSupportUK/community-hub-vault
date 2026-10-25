import { describe, expect, test } from "bun:test";
import { matchesRemoteDevice, remoteAppKind } from "../src/components/app/remote-app-downloads";

describe("remote APK placement", () => {
  test("TV Enabler belongs to Amazon only", () => {
    const app = { appName: "BM TV Enabler" };
    expect(matchesRemoteDevice(app, "amazon")).toBe(true);
    expect(matchesRemoteDevice(app, "android")).toBe(false);
  });
  test("Remote Helper and Remote Support belong to both TV platforms", () => {
    for (const appName of ["BM Remote Helper", "BM Remote Support", "BM Support Remote"]) {
      expect(matchesRemoteDevice({ appName }, "amazon")).toBe(true);
      expect(matchesRemoteDevice({ appName }, "android")).toBe(true);
    }
  });
  test("ordinary BM Support downloads stay outside remote help", () => {
    expect(remoteAppKind({ appName: "BM Support", fileName: "bm-support.apk" })).toBe(null);
  });
});