import { expect, test } from "bun:test";
import { createRequire } from "node:module";
const { refreshConnection } = createRequire(import.meta.url)("../core.cjs");

test("used reference is reported while idle without running TV commands", async () => {
  let used = false, commands = 0;
  expect(await refreshConnection("192.168.1.25", "a".repeat(64), async () => { commands++; return ""; }, () => {}, async () => Response.json({ state: "idle", referenceUsed: true }), async () => {}, (value: boolean) => { used = value; })).toBe(false);
  expect(used).toBe(true);
  expect(commands).toBe(0);
});

test("ended screen share reports expiry before 24 hours without touching the TV", async () => {
  let expired = false, commands = 0;
  const done = await refreshConnection("192.168.1.25", "a".repeat(64), async () => { commands++; return ""; }, () => {},
    async () => Response.json({ state: "expired" }, { status: 403 }), async () => {}, () => {}, () => { expired = true; });
  expect(expired).toBe(true);
  expect(done).toBe(false);
  expect(commands).toBe(0);
});

test("server errors do not invalidate a saved sharing reference", async () => {
  let expired = false;
  await expect(refreshConnection("192.168.1.25", "a".repeat(64), async () => "", () => {},
    async () => Response.json({ state: "expired" }, { status: 500 }), async () => {}, () => {}, () => { expired = true; })).rejects.toThrow();
  expect(expired).toBe(false);
});

test("no queued renewal means no TV commands, including while sharing is active", async () => {
  for (const state of ["idle", "in_progress", "expired"]) {
    let commands = 0;
    const result = await refreshConnection("192.168.1.25", "a".repeat(64), async () => { commands++; return ""; }, () => {}, async () => Response.json({state}));
    expect(result).toBe(false);
    expect(commands).toBe(0);
  }
});
test("claimed renewal reads and sends the new Helper code without any Home or consent commands", async () => {
  const commands:string[][] = [], posts:any[] = [];
  const adb = async (args:string[]) => {
    commands.push(args);
    if (args[0] === "devices") return "192.168.1.25:5555\tdevice";
    if (args.includes("getprop ro.product.manufacturer")) return "Amazon";
    if (args.some(s => s.startsWith("pm path"))) return "package:/data/app/x.apk";
    if (args.includes("settings get secure enabled_accessibility_services")) return "uk.bmsupport.remote.control/uk.bmsupport.remote.control.ControlService";
    if (args.includes("settings get secure accessibility_enabled")) return "1";
    if (args.some(s => s.includes("uiautomator"))) return '<node package="uk.bmsupport.remote" text="654321" />';
    return "Success";
  };
  const post = async (_url:string, options:any) => {
    const body = JSON.parse(options.body); posts.push(body);
    return Response.json(body.requestId ? {state:"done"} : {state:"refresh",requestId:"00000000-0000-0000-0000-000000000001"});
  };
  expect(await refreshConnection("192.168.1.25","a".repeat(64),adb,()=>{},post,async()=>{})).toBe(true);
  expect(posts[1]?.helperCode).toBe("654321");
  expect(commands.filter(args => args.includes("am force-stop uk.bmsupport.remote")).length).toBe(1);
  expect(commands.some(args => args.some(arg => /keyevent|consent/.test(arg)))).toBe(false);
});