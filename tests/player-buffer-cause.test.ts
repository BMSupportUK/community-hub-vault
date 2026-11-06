import { describe, expect, test } from "bun:test";
import { stallCause } from "../src/lib/player-buffering";

describe("stall cause", () => {
  test("app-sent cause is kept", () => expect(stallCause({ cause: "advert_switch", stall_ms: 3000 })).toBe("advert_switch"));
  test("older app: zero-length freeze is a provider cut", () => expect(stallCause({ freeze: true, stall_ms: 0 })).toBe("provider_cut"));
  test("older app: ordinary stall is a network drop", () => expect(stallCause({ stall_ms: 4000 })).toBe("network_drop"));
});
