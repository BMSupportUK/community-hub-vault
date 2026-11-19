import { test, expect, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const devices = [
  { id: "d1", name: "Pixel phone", platform: "phone", linked_at: "2026-11-18", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
  { id: "d2", name: "Kitchen box", platform: "android", linked_at: "2026-11-17", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
  { id: "d3", name: "Bedroom Fire Stick", platform: "firetv", linked_at: "2026-11-16", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
  { id: "d4", name: "Office PC", platform: "windows", linked_at: "2026-11-15", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
  { id: "d5", name: "Mac mini", platform: "mac", linked_at: "2026-11-14", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
  { id: "d6", name: "iPad browser", platform: "web", linked_at: "2026-11-13", last_seen_at: "2026-11-19", credential_id: "cred-1", iptv_username: "bmuser", room_name: null },
];

const account = { id: "cred-1", app_login_name: "bmuser", password: "pw", expiry_at: null, account_type: "single", account_number: 1 };

mock.module("../src/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
mock.module("../src/components/app/AccountProfiles", () => ({
  useAccountProfiles: () => ({ userId: "u1", activeProfile: { id: "cred-1" }, loaded: true }),
  AccountProfiles: () => null,
}));
mock.module("../src/hooks/use-player-devices", () => ({
  usePlayerDevices: () => ({ devices, reload: async () => {} }),
}));
mock.module("../src/components/app/CustomerNumber", () => ({
  useCustomerNumber: () => "976687",
  useLoginPlayerNumbers: () => [],
}));
mock.module("../src/lib/player.functions", () => ({
  sendLoginWithCode: async () => ({}),
  sendLoginToDevice: async () => ({}),
  notMePlayerDevice: async () => ({}),
  requestPlayerHomeMove: async () => ({}),
}));
mock.module("../src/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) }), delete: () => ({ eq: async () => ({ error: null }) }) }),
    rpc: async () => ({ data: [], error: null }),
  },
}));
mock.module("@tanstack/react-start", () => ({ useServerFn: () => async () => ({}) }));

const { PlayerDeviceLinkSection } = await import("../src/components/app/PlayerDeviceLinkSection");

const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
client.setQueryData(["player-saved-logins", "u1", "cred-1"], [account]);
const html = renderToStaticMarkup(
  createElement(QueryClientProvider, { client }, createElement(PlayerDeviceLinkSection)),
);

const marker = (key: string) => `data-device-group="${key}"`;
const at = (key: string) => html.indexOf(marker(key));

test("the linked device list shows a Box, Amazon, PC / Mac and Phone heading in that order", () => {
  for (const key of ["box", "amazon", "computer", "phone"]) expect(at(key)).toBeGreaterThan(-1);
  const positions = ["box", "amazon", "computer", "phone"].map(at);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("each device sits under its own type heading", () => {
  const box = at("box"), amazon = at("amazon"), computer = at("computer"), phone = at("phone");
  const inRange = (name: string, from: number, to: number) => {
    const i = html.indexOf(name);
    expect(i > from && i < to).toBe(true);
  };
  inRange("Kitchen box", box, amazon);
  inRange("Bedroom Fire Stick", amazon, computer);
  inRange("Office PC", computer, phone);
  inRange("Mac mini", computer, phone);
  expect(html.indexOf("Pixel phone") > phone).toBe(true);
  expect(html.indexOf("iPad browser") > phone).toBe(true);
});

test("headings are labelled with the words the customer asked for", () => {
  expect(html).toContain(">Box<span");
  expect(html).toContain(">Amazon<span");
  expect(html).toContain(">PC / Mac<span");
  expect(html).toContain(">Phone<span");
});
