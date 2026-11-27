import { expect, test } from "bun:test";
import { bumpEmail } from "./provider-panel.server";
test("taken email gets 1 before the @", () => { expect(bumpEmail("john@gmail.com")).toBe("john1@gmail.com"); });
