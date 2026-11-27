// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { bumpEmail } from "./provider-panel.server";
test("taken email gets 1 before the @", () => { expect(bumpEmail("john@gmail.com")).toBe("john1@gmail.com"); });
