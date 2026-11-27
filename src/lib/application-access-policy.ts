import { z } from "zod";

export const applicationAccessSchema = z.object({
  screen: z.boolean(), dashboard: z.boolean(), portal: z.boolean(),
  dashboardUntil: z.string().nullable(), portalUntil: z.string().nullable(),
});
export type ApplicationAccess = z.infer<typeof applicationAccessSchema>;
const SCREEN_RECOVERY = new Set(`getApplicationAccess screenAccess verifyScreenLockPassword getScreenLockAdminAccess requestMyPortalCode unlockMyPortalCode requestPortalCode redeemPortalCode requestMfaReset listMyMfaFactors customerAccountSwitchStatus returnToAdminAccount`.split(" "));
const DASHBOARD_ACTIONS = new Set(`vpnCredits panelCreditsFn backfillVpnDetection providerSetupLine getProviderPanelUrlHint saveProviderPanelUrl listStaffPinRequests listStaffPins issueStaffPin revokeStaffPin startCustomerAccountSwitch adminCustomerSwitch adminSwitchToCustomer`.split(" "));
const PORTAL_ACTIONS = new Set(`readPortalCredentials requestPortalPinReset sendTicketTempPin openGuide openPlayerUserGuide getGuideVideoUrl createTicketEnablerPin getTicketEnablerPinStatus getTicketEnablerLoggedIn createOrderEnablerPin getOrderEnablerPinStatus getDirectInstallPin createDirectInstallPin createDirectInstallLink startDirectInstallSession getDirectInstallProgress`.split(" "));
export function applicationActionAllowed(access: ApplicationAccess, name: string) {
  if (!access.screen && !SCREEN_RECOVERY.has(name)) return false;
  if (!access.dashboard && (name.startsWith("admin") || DASHBOARD_ACTIONS.has(name))) return false;
  if (!access.portal && PORTAL_ACTIONS.has(name)) return false;
  return true;
}
export function freshSecondFactor(claims: Record<string, unknown>, now = Date.now()) {
  if (claims["aal"] !== "aal2" || !Array.isArray(claims["amr"])) return false;
  return claims["amr"].some((item: unknown) => {
    const parsed = z.object({ method: z.string(), timestamp: z.number() }).safeParse(item);
    return parsed.success && parsed.data.method === "totp" && parsed.data.timestamp * 1000 <= now && now - parsed.data.timestamp * 1000 < 60_000;
  });
}
