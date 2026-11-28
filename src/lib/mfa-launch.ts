// Module state lasts for this loaded app, but resets on a fresh app/page opening.
// This keeps ordinary in-app navigation smooth without treating a restored
// AAL2 session as permission to skip 2FA on the next launch.
let launchMfaComplete = false;

export function mfaLaunchComplete(): boolean {
  return launchMfaComplete;
}

export function completeMfaLaunch(): void {
  launchMfaComplete = true;
}
