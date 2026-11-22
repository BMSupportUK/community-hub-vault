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
    // Always a date a week ahead: past guide days are hidden as finished.
    const d = new Date(Date.now() + 7 * 86400000);
    const day = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
    const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "Europe/London" });
    const n = Number(d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" }));
    const sfx = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    wrap.innerHTML =
      `<div>${day}, ${n}${sfx} ${month}</div>` +
      "<div><br></div><div>18:30 GMT</div>" +
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
