// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
const g = globalThis as Record<string, unknown>;
const saved = { document: g["document"], window: g["window"], HTMLElement: g["HTMLElement"], Node: g["Node"], NodeFilter: g["NodeFilter"] };
Object.assign(g, { document: win.document, window: win, HTMLElement: win.HTMLElement, Node: win.Node, NodeFilter: win.NodeFilter });
afterAll(() => { Object.assign(g, saved); });

describe("guide cards: bracketed times after a channel", () => {
  test("Boxing guide stays one card with BBC Two (9pm UK) as its channel", async () => {
    const { annotateTimesInEl } = await import("./parse-event-times");
    const wrap = win.document.createElement("div");
    wrap.innerHTML =
      "<div>Friday, 20th November</div><div><br></div><div>18:30 GMT</div>" +
      "<div>Price v Kotaskova · 6:30pm UK | 1:30pm ET · Ringwalk Approx 9:30pm UK</div>" +
      "<div>BBC Two (9pm UK)</div>";
    annotateTimesInEl(wrap as unknown as HTMLElement, "Europe/London", "Europe/London");
    const rows = Array.from(wrap.querySelectorAll("[data-tz-row][data-tz-utc]"));
    expect(rows.length).toBe(1);
    const text = rows[0]?.textContent ?? "";
    expect(text).toContain("18:30");
    expect(text).toContain("Ringwalk Approx 9:30pm UK");
    expect(text).toContain("BBC Two (9pm UK)");
  });
});
