// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { describe, expect, test } from "bun:test";
import { latestWatchActivity, membersByLetter, viewingSegments, watchActivityCredit, type WatchActivity } from "./player-watch-activity";

describe("member viewing activity", () => {
  test("only the last 10 watched activities are returned newest first", () => {
    const rows: WatchActivity[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), kind: "live", title: `Channel ${i}`, category: null, platform: "android", started_at: new Date(i * 60000).toISOString(), last_watched_at: new Date(i * 60000).toISOString(), seconds: 60 }));
    expect(latestWatchActivity(rows).map(row => row.id)).toEqual(["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);
    expect(rows[0]?.id).toBe("0");
  });
  test("pie chart is split by actual watched time", () => {
    const segments = viewingSegments([{ kind: "live", seconds: 2700 }, { kind: "film", seconds: 900 }]);
    expect(segments.find(row => row.key === "live")?.percent).toBe(75);
    expect(segments.find(row => row.key === "film")?.percent).toBe(25);
    expect(viewingSegments([]).every(row => row.percent === 0)).toBe(true);
  });
  test("history uses the verified previous device owner and title", () => {
    const device = { id: "device", user_id: "owner", watching_kind: "film", watching_title: "Previous film", watching_category: "Drama", watching_since: "2026-11-05T08:00:00Z", platform: "windows" };
    const result = watchActivityCredit(device, { kind: "film", seconds: 60 }, Date.parse("2026-11-05T08:01:00Z"));
    expect(result?._user).toBe("owner");
    expect(result?._title).toBe("Previous film");
    expect(result?._seconds).toBe(60);
    expect(watchActivityCredit({ ...device, user_id: null }, { kind: "film", seconds: 60 }, 0)).toBeNull();
    expect(watchActivityCredit(device, null, 0)).toBeNull();
  });
  test("members are listed under their letter in A–Z order with no all group", () => {
    const members = [{ username: "dane" }, { username: "alice" }, { username: "Aaron" }, { username: "88_fan" }, { username: "brian" }];
    expect(membersByLetter(members)).toEqual([
      { letter: "A", members: [{ username: "Aaron" }, { username: "alice" }] },
      { letter: "B", members: [{ username: "brian" }] },
      { letter: "D", members: [{ username: "dane" }] },
      { letter: "#", members: [{ username: "88_fan" }] },
    ]);
    expect(membersByLetter([])).toEqual([]);
  });
});