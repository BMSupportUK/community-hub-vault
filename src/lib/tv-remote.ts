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
