/** Shared TV remote rules used by the staff page, the TV endpoint and tests. */
export const TV_PAIR_CODE_MINUTES = 10;
export const TV_IDLE_MINUTES = 30;
export const TV_REMOTE_ROLES = ["admin", "management", "staff"] as const;

/** Only a pending request or an ongoing share blocks another help request. */
export function screenShareInProgress(status: string | null): boolean {
  return status === "pending" || status === "claimed" || status === "active";
}

export type TvKey =
  | "up" | "down" | "left" | "right" | "ok" | "back" | "home" | "menu"
  | "play_pause" | "volume_up" | "volume_down" | "mute";

export function canUseTvRemote(roles: readonly string[]): boolean {
  return roles.some((r) => (TV_REMOTE_ROLES as readonly string[]).includes(r));
}

/** The global overview is owner-only; staff keep order/ticket screen sharing. */
export function canOpenTvRemoteOverview(roles: readonly string[]): boolean {
  return roles.includes("admin");
}

export function screenShareDestination(kind: string | null, id: string | null) {
  if (!id) return null;
  if (kind === "order") return { to: "/screen-share/order/$orderId" as const, params: { orderId: id } };
  if (kind === "ticket") return { to: "/screen-share/ticket/$ticketId" as const, params: { ticketId: id } };
  return null;
}

/** Request-box actions open the secure order's own Screen share tab. */
export function screenShareRequestDestination(kind: string | null, id: string | null) {
  if (!id) return null;
  if (kind === "order") return { to: "/admin-secure-page" as const, search: { order: id, tab: "screen" as const } };
  return screenShareDestination(kind, id);
}

export function canSeeTvRemoteHistory(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("management");
}

export function normalizePairCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

export function pairCodeExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= TV_PAIR_CODE_MINUTES * 60_000;
}

export function sessionIdle(lastActivity: Date, now: Date): boolean {
  return now.getTime() - lastActivity.getTime() >= TV_IDLE_MINUTES * 60_000;
}

/** PC keyboard shortcuts for the remote. */
export function keyForKeyboard(key: string): TvKey | null {
  switch (key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "Enter": return "ok";
    case "Backspace": return "back";
    case "Escape": return "home";
    case " ": return "play_pause";
    case "+": case "=": return "volume_up";
    case "-": return "volume_down";
    default: return null;
  }
}

/** Remote buttons on the staff panel (must match KEYS in the TV helper). */
export const REMOTE_PAD_KEYS = ["up", "down", "left", "right", "ok", "back", "home", "play_pause", "volume_up", "volume_down"] as const;

/** The host only forwards remote commands from the staff member currently in control. */
export function canForwardRemote(controllerId: string | null, from: string | null): boolean {
  return !!controllerId && !!from && controllerId === from;
}

/** What the TV helper reports about remote control (v1.8 adds the step-by-step fields). */
export type RemoteControlReport = {
  fire: boolean; installed: boolean; enabled: boolean;
  running?: boolean; listed?: boolean; adb?: boolean; helper?: string | null; error?: string | null;
};

/** Staff-facing explanation of why the remote isn't ready yet (null when it is ready). */
export function remoteSetupNotice(c: RemoteControlReport): string | null {
  if (c.enabled) return null;
  const old = !c.helper ? " The customer's helper is out of date — ask them to update BM Remote Helper to v1.9 from Install Guides." : "";
  if (!c.installed) return "Step 1 missing: the remote control part isn't installed. Ask the customer to open BM Remote Helper and press Install." + old;
  if (c.fire) {
    if (c.adb === false) return "Step 2 missing: ADB debugging is off on the Fire TV. Settings > My Fire TV > Developer options > ADB debugging on, then press Turn on remote control in the helper." + old;
    const err = c.error ? ` The TV said: "${c.error}"` : "";
    return "Step 3 missing: remote control isn't switched on yet. Ask the customer to end this session, open BM Remote Helper, press Turn on remote control and press Allow on the TV." + err + old;
  }
  return "Remote control is off on this TV. Ask the customer to open BM Remote Helper, press Open settings and switch on BM Remote Control." + old;
}
