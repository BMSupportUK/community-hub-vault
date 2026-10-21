import { Tv, Popcorn, Briefcase, Users } from "lucide-react";

export const PORTAL_QUICK_LINKS = [
  { to: "/new-content", label: "New Content", blurb: "Latest additions", Icon: Tv },
  { to: "/what-to-watch", label: "What To Watch", blurb: "Picks for tonight", Icon: Popcorn },
  { to: "/staff", label: "Staff", blurb: "Meet the team", Icon: Briefcase },
  { to: "/members", label: "Members", blurb: "Our community", Icon: Users },
] as const;

export function isPortalQuickLinkPath(path: string) {
  const normalized = path.replace(/\/$/, "");
  return PORTAL_QUICK_LINKS.some(({ to }) => to === normalized);
}