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
    { id: "/staff-portal", label: "Home" },
    { id: "portal:/tickets", label: "Tickets" },
    { id: "portal:/home/$channel", label: "Talk" },
    { id: "portal:/shifts", label: "Shifts" },
    { id: "portal:/shift-history", label: "Shift history" },
    { id: "portal:/staff-pin", label: "Staff PIN" },
    { id: "portal:admin-panel", label: "Admin Panel" },
    { id: "portal:/moderation", label: "Access Requests" },
    { id: "portal:admin-orders", label: "Shop Orders" },
    { id: "portal:admin-customers", label: "Customers" },
    { id: "/sports-guides", label: "Sports guides" },
    { id: "/jobs", label: "BM Support jobs" },
    { id: "/forum", label: "Boro Fan Zone" },
  ],
  member: [
    { id: "/portal", label: "Home" },
    { id: "portal:/shop", label: "Shop" },
    { id: "portal:/tickets", label: "Tickets" },
    { id: "portal:/home/$channel", label: "Talk" },
    { id: "portal:/portal/logins", label: "Service Credentials" },
    { id: "portal:/install-guides", label: "Install Guides" },
    { id: "portal:/knowledge-base", label: "Knowledge Base" },
    { id: "portal:/leaderboard", label: "Referrals" },
    { id: "/sports-guides", label: "Sports guides" },
    { id: "/jobs", label: "BM Support jobs" },
    { id: "/forum", label: "Boro Fan Zone" },
  ],
} as const;