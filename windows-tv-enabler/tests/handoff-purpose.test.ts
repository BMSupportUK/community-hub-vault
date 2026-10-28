import { expect, test } from "bun:test";
const core = require("../core.cjs");

test("support and installation handoffs remain distinct and advertise purpose-aware protocol", async () => {
  for (const purpose of ["support", "install"]) {
    const post = async (_url: string, init: { body: string }) => {
      expect(JSON.parse(init.body).protocol).toBe(2);
      return Response.json({ purpose, device: "android", helpPlan: 1, ticketId: "existing", apps: [] });
    };
    expect((await core.redeemHandoff("123456", post)).purpose).toBe(purpose);
  }
});

test("troubleshooting reports to its own endpoint with only the existing ticket and share proof", async () => {
  const post = async (url: string, init: { body: string }) => {
    expect(url).toBe("https://bmsupport.uk/api/public/enabler-ticket-support");
    expect(JSON.parse(init.body)).toEqual({ ticketId: "existing", shareToken: "proof" });
    return Response.json({ linked: true });
  };
  expect((await core.ticketSupport("existing", "proof", post)).linked).toBe(true);
});