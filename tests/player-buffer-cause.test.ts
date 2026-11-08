import { describe, expect, test } from "bun:test";
import { stallCause, BufferEvent } from "../src/lib/player-buffering";

describe("stall cause", () => {
  test('new diagnostics retain format, decoder and event without needing credentials', () => {
    const e=BufferEvent.parse({stall_ms:6000,at:1000,name:'DAZN CA 19',stream_format:'m3u8',decoder:'c2.amlogic.avc.decoder',recovery_provider:'dazn',event_name:'BKFC 96'});
    expect(e.stream_format).toBe('m3u8');expect(e.decoder).toBe('c2.amlogic.avc.decoder');expect(e.event_name).toBe('BKFC 96');expect(e.recovery_provider).toBe('dazn');
    expect(BufferEvent.parse({stall_ms:6000,at:1000,stream_format:'https://private.example'}).stream_format).toBeUndefined();
  });
  test("app-sent cause is kept", () => expect(stallCause({ cause: "advert_switch", stall_ms: 3000 })).toBe("advert_switch"));
  test("older app: zero-length freeze is a provider cut", () => expect(stallCause({ freeze: true, stall_ms: 0 })).toBe("provider_cut"));
  test("older app: ordinary stall is a network drop", () => expect(stallCause({ stall_ms: 4000 })).toBe("network_drop"));
});
