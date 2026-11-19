export type RailScope = "staff" | "member" | "fanzone";
export type RailOrder = Record<string, number>;
export const RAIL_ORDER_CHANGED = "bm-rail-order-changed";
export const railOrderKey = (scope: RailScope, id: string) => `rail:${scope}:${id}`;

export function sortRailItems<T>(items: readonly T[], order: RailOrder, scope: RailScope, idOf: (item: T) => string): T[] {
  return items.map((item, index) => ({ item, rank: order[railOrderKey(scope, idOf(item))] ?? 100000 + index }))
    .sort((a, b) => a.rank - b.rank).map(({ item }) => item);
}

export function railOrderRows(scope: RailScope, ids: readonly string[]) {
  return ids.map((id, index) => ({ key: railOrderKey(scope, id), sort_order: (index + 1) * 10 }));
}

export const RAIL_EDITOR_ITEMS = {
  staff: [
    { id: "portal:/tickets", label: "Tickets" },
    { id: "portal:/home/$channel", label: "Talk" },
    { id: "portal:/moderation", label: "Access Requests" },
    { id: "portal:my-shift", label: "My shift (Shifts, Shift history, Staff PIN)" },
    { id: "portal:admin-customers", label: "Customers" },
    { id: "portal:admin-orders", label: "Shop Orders" },
    { id: "portal:/send-to-app", label: "Link Device" },
    { id: "/sports-guides", label: "Sports guides" },
    { id: "/jobs", label: "BM Support jobs" },
    { id: "/forum", label: "Boro Fan Zone" },
  ],
  member: [
    { id: "portal:/tickets", label: "Tickets" },
    { id: "portal:/home/$channel", label: "Talk" },
    { id: "portal:/knowledge-base", label: "Knowledge Base" },
    { id: "portal:/portal/logins", label: "Service Credentials" },
    { id: "portal:/send-to-app", label: "Link Device" },
    { id: "portal:/leaderboard", label: "Referrals" },
    { id: "/sports-guides", label: "Sports guides" },
    { id: "/jobs", label: "BM Support jobs" },
    { id: "/forum", label: "Boro Fan Zone" },
  ],
} as const;
/** Staff rail groups: 0 Work, 1 My shift, 2 People, 3 Sales, 4 Community. */
const STAFF_GROUPS: Record<string, number> = {
  "portal:/tickets": 0, "portal:/home/$channel": 0, "portal:/moderation": 0,
  "portal:my-shift": 1,
  "portal:admin-customers": 2,
  "portal:admin-orders": 3, "portal:/send-to-app": 3,
};
export function staffRailGroup(id: string): number {
  return STAFF_GROUPS[id] ?? 4;
}
/** Customer rail groups: 0 Support, 1 My account, 2 Community. Shop and guides live in the header. */
const MEMBER_GROUPS: Record<string, number> = {
  "portal:/tickets": 0, "portal:/home/$channel": 0, "portal:/knowledge-base": 0,
  "portal:/portal/logins": 1, "portal:/send-to-app": 1, "portal:/leaderboard": 1,
};
export function memberRailGroup(id: string): number {
  return MEMBER_GROUPS[id] ?? 2;
}
