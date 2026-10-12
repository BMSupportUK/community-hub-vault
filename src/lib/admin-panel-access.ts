import type { PagePermMap } from "@/lib/page-access";

/**
 * Who may open the BM Support admin dashboard from the header, and what the
 * button reads. The owner reads "Admin | Admin Panel"; management and staff
 * read "Staff | Admin Panel". Both names open the same dashboard — which
 * sections are inside it for a given person is decided by the page permission
 * list (public.page_permissions), enforced here and by the route guard.
 */
export const ADMIN_PANEL_ROLES = ["admin", "management", "staff"] as const;

export function canOpenAdminPanel(roles: readonly string[]): boolean {
  return ADMIN_PANEL_ROLES.some((r) => roles.includes(r));
}

export function adminPanelLabel(roles: readonly string[]): string {
  return roles.includes("admin") ? "Admin | Admin Panel" : "Staff | Admin Panel";
}

/** The access-relevant shape of a dashboard tool card. */
export type AdminPanelTool = {
  to?: string;
  tabKey?: string;
  adminOnly?: boolean;
  managementToo?: boolean;
};

/**
 * True when the tool card may be shown.
 *
 * The owner and management keep every card they already had. Staff only see
 * cards for pages the permission list allows them, so no card can bounce them
 * back to Home — and the owner-only tabs (theme, invoice template, header
 * links) stay with the owner.
 */
export function adminPanelToolAllowed(
  tool: AdminPanelTool,
  roles: readonly string[],
  perms: PagePermMap | null,
): boolean {
  const isAdmin = roles.includes("admin");
  const isManagement = roles.includes("management");
  if (tool.adminOnly && !isAdmin && !(tool.managementToo && isManagement)) return false;
  if (isAdmin || isManagement) return true;
  if (!canOpenAdminPanel(roles)) return false;
  if (!tool.to || tool.tabKey) return false;
  // Owner/management tabs have no page of their own; staff wait for the list.
  if (!perms) return false;
  const pageKey = tool.to.replace(/^\//, "").split("/")[0] ?? "";
  const allowed = perms[pageKey];
  if (!allowed) return true; // page not registered = open (same rule as the route guard)
  const bm = bmSupportRoles(roles);
  return bm.some((r) => allowed.includes(r));
}

/**
 * Boro Fan Zone roles never add cards to the BM Support dashboard — only the
 * person's BM Support roles (e.g. staff) count there.
 */
export function bmSupportRoles(roles: readonly string[]): string[] {
  return roles.filter((r) => !r.startsWith("boro_fan_zone"));
}

/**
 * Extra dashboard cards for staff: every BM Support page the permission list
 * ticks for their BM Support roles that has no tool card of its own, so each
 * allowed section shows up. Excludes the dashboard itself.
 */
export function staffAllowedPageKeys(
  roles: readonly string[],
  perms: PagePermMap | null,
  existingKeys: ReadonlySet<string>,
  isFanZonePage: (key: string) => boolean,
): string[] {
  if (!perms) return [];
  if (roles.includes("admin") || roles.includes("management")) return [];
  if (!canOpenAdminPanel(roles)) return [];
  const bm = bmSupportRoles(roles);
  return Object.entries(perms)
    .filter(([key, allowed]) =>
      key !== "admin" &&
      !existingKeys.has(key) &&
      !isFanZonePage(key) &&
      bm.some((r) => allowed.includes(r)),
    )
    .map(([key]) => key);
}

/** Pages that belong on the Boro Fan Zone admin dashboard, not BM Support's. */
export const FAN_ZONE_ADMIN_PATHS = [
  "/admin-fan-zone", "/admin-boro-team-sheet", "/admin-predictions", "/admin-fantasy-motm",
  "/admin-fantasy-scoring", "/admin-fantasy-injuries", "/admin-fantasy-squad-numbers", "/admin-forum",
  "/fan-zone-appeals", "/fan-zone-sanctions", "/fan-zone-security", "/fan-zone-sounds",
] as const;

export function isFanZoneAdminPath(to: string | undefined): boolean {
  return !!to && (FAN_ZONE_ADMIN_PATHS as readonly string[]).includes(to);
}

export function canOpenFanZoneAdminPanel(roles: readonly string[]): boolean {
  // BM Support staff and management have nothing to do with the Fan Zone:
  // only the owner and Boro Fan Zone roles may open its dashboard.
  return roles.includes("admin") || roles.some((r) => r.startsWith("boro_fan_zone"));
}

/** Fan Zone dashboard cards: the owner sees all; otherwise only ticked Boro Fan Zone roles count (never BM staff/management). */
export function fanZoneToolAllowed(tool: AdminPanelTool, roles: readonly string[], perms: PagePermMap | null): boolean {
  if (roles.includes("admin")) return true;
  if (tool.adminOnly) return false;
  const fz = roles.filter((r) => r.startsWith("boro_fan_zone"));
  if (!fz.length || !tool.to || !perms) return false;
  const allowed = perms[tool.to.replace(/^\//, "").split("/")[0] ?? ""];
  if (!allowed) return true;
  return fz.some((r) => allowed.includes(r));
}
