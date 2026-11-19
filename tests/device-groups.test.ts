import { test, expect } from "bun:test";
import { deviceGroupKey, deviceGroupLabel, groupDevicesByType } from "../src/lib/device-groups";

test("android TV is a Box, Fire TV is Amazon", () => {
  expect(deviceGroupKey("android")).toBe("box");
  expect(deviceGroupKey("firetv")).toBe("amazon");
});

test("windows and mac are PC / Mac, phones and browser are Phone", () => {
  expect(deviceGroupKey("windows")).toBe("computer");
  expect(deviceGroupKey("mac")).toBe("computer");
  expect(deviceGroupKey("phone")).toBe("phone");
  expect(deviceGroupKey("web")).toBe("phone");
});

test("an unknown platform falls into Other", () => {
  expect(deviceGroupKey("samsung")).toBe("other");
  expect(deviceGroupLabel("samsung")).toBe("Other");
});

test("the list is ordered Box, Amazon, PC / Mac, Phone with empty groups left out", () => {
  const groups = groupDevicesByType([
    { id: "1", platform: "phone" },
    { id: "2", platform: "windows" },
    { id: "3", platform: "android" },
    { id: "4", platform: "firetv" },
    { id: "5", platform: "mac" },
  ]);
  expect(groups.map((g) => g.label)).toEqual(["Box", "Amazon", "PC / Mac", "Phone"]);
});

test("devices keep their order inside a group", () => {
  const groups = groupDevicesByType([
    { id: "a", platform: "android" },
    { id: "b", platform: "android" },
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].devices.map((d) => d.id)).toEqual(["a", "b"]);
});
