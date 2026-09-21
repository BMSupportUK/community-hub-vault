/**
 * Friendly names for the page a member is currently looking at.
 * Used by the presence layer so staff and member cards can show
 * "Viewing: Tickets" instead of a raw URL.
 */
const EXACT: Record<string, string> = {
  "/": "Landing page",
  "/home": "Home",
  "/tickets": "Tickets",
  "/shop": "Shop",
  "/install-guides": "Install Guides",
  "/sports-guides": "Sports guides",
  "/knowledge-base": "Knowledge base",
  "/what-to-watch": "What to Watch",
  "/leaderboard": "Referrals",
  "/new-content": "New content",
  "/members": "Members",
  "/staff": "Staff",
  "/clock": "Clock in / out",
  "/profile": "Profile",
  "/admin": "Admin dashboard",
  "/forum": "Boro Fan Zone",
  "/fan-zone": "Boro Fan Zone",
  "/boro-fantasy": "Boro Fantasy",
  "/boro-predictions": "Boro Predictions",
  "/predictions": "Predictions",
  "/competition-winners": "Competition Winners",
  "/fanzone/messages": "Fan Zone Inbox",
  "/fanzone/profile": "Fan Zone Profile",
  "/fanzone/blocks": "Fan Zone Ignore list",
  "/admin-fan-zone": "Fan Zone Members",
  "/moderation": "BM Support | Access Requests",
  "/login": "Sign in",
  "/signup": "Sign up",
};

const PREFIX: Array<[string, string]> = [
  ["/home/", "Customer Chatroom"],
  ["/tickets/", "Tickets"],
  ["/fan-zone/", "Boro Fan Zone"],
  ["/fanzone/", "Boro Fan Zone"],
  ["/forum/", "Boro Fan Zone"],
  ["/u/", "Member profile"],
  ["/sports-guides/", "Sports guides"],
  ["/install-guides/", "Install Guides"],
  ["/knowledge-base/", "Knowledge base"],
  ["/shop/", "Shop"],
  ["/admin", "Admin dashboard"],
];

/** Turn a route path into a short human page name. */
export function pageLabelForPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = EXACT[path];
  if (exact) return exact;
  for (const [prefix, label] of PREFIX) {
    if (path.startsWith(prefix)) return label;
  }
  const first = path.replace(/^\//, "").split("/")[0];
  if (!first) return null;
  return first
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
