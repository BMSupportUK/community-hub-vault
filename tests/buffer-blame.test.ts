import { describe, expect, test } from "bun:test";
import { BufferEvent, bufferBlame } from "@/lib/player-buffering";

describe("buffering blame", () => {
  test("box guess kept when nobody else stalled", () => expect(bufferBlame("customer", 0)).toBe("customer"));
  test("two other homes on the same channel means the stream", () => expect(bufferBlame("customer", 2)).toBe("stream"));
  test("one other home is not enough to overrule", () => expect(bufferBlame("customer", 1)).toBe("customer"));
  test("older apps without a guess read unclear", () => expect(bufferBlame(undefined, 0)).toBe("unclear"));
  test("unknown blame values are dropped, not rejected", () =>
    expect(BufferEvent.parse({ stall_ms: 1, at: 1, blame: "bogus" }).blame).toBeUndefined());
});
