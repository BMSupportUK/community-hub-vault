// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with bun test.
import { expect, test } from "bun:test";
import { directStepAccess } from "./direct-install-navigation";

test("unanswered setup cannot skip to later steps", () => {
  expect(directStepAccess([false, false, false, false, false, false], null)).toEqual([true, false, false, false, false, false]);
});
test("new installs unlock only the next step and preserve completed-step access", () => {
  expect(directStepAccess([false, true, false, false, false, false], "no")).toEqual([true, true, true, false, false, false]);
  expect(directStepAccess([false, true, true, true, false, false], "no")).toEqual([true, true, true, true, true, false]);
});
test("existing installs skip download but wait for PIN sign-in before permissions", () => {
  expect(directStepAccess([false, false, false, false, false, false], "yes")).toEqual([true, false, false, true, false, false]);
  expect(directStepAccess([false, false, false, true, false, false], "yes")).toEqual([true, false, false, true, true, false]);
});
test("permission confirmation unlocks code entry without blocking earlier steps", () => {
  expect(directStepAccess([false, true, true, true, true, false], "no")).toEqual([true, true, true, true, true, true]);
});