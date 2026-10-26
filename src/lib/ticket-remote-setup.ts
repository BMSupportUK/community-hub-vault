export type SetupDevice = "amazon" | "android";
export type AppChecks = { adb?: boolean; helper?: boolean; control?: boolean; accessibility?: boolean };
/** What proves a step: a check reported by BM TV Enabler / BM Support app, the app report itself, or the live Helper code. */
export type StepProof = "adb" | "helper" | "accessibility" | "reported" | "code";
export type SetupStep = { title: string; body: string; proof: StepProof };

export const REMOTE_SETUP_STEPS: Record<SetupDevice, SetupStep[]> = {
  amazon: [
    { title: "Turn on developer options and ADB debugging", body: "On your Fire TV go to Settings › My Fire TV › About and press the device name 7 times. Then Settings › My Fire TV › Developer options › ADB debugging ON.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler, connect to your Fire TV and press Allow on the TV, then type the 4-digit code the TV shows into the app. The app then sets everything up by itself. When it confirms your TV, type the code it shows into the box at the top of this page.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "Confirm TV setup inside BM TV Enabler, then use its Open BM Remote Helper button to show the TV's six-digit code. Enter that code at the top of this Remote setup page.", proof: "code" },
  ],
  android: [
    { title: "Turn on developer options and debugging", body: "On your TV go to Settings › System › About and press Android TV OS build 7 times. Then Settings › System › Developer options and switch ON Network debugging — or Wireless debugging if that's what your TV has. Leave it switched on.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler, type your TV's address, connect and press Allow on the TV, then type the 4-digit code the TV shows into the app. The app then sets everything up by itself. When it confirms your TV, type the code it shows into the box at the top of this page.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "Confirm TV setup inside BM TV Enabler, then use its Open BM Remote Helper button to show the TV's six-digit code. Enter that code at the top of this Remote setup page.", proof: "code" },
  ],
};

/** A step is only ever done because an app reported it — never because the customer ticked it. */
export function stepDone(step: SetupStep, row: { app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null }) {
  const c = row.app_checks ?? {};
  if (step.proof === "code") return !!row.completed_at;
  if (step.proof === "reported") return !!row.app_checked_at;
  return !!c[step.proof];
}

/** The final Helper code is only offered once the apps have reported every TV check. */
export function appChecksPassed(c: AppChecks | null | undefined, _device?: SetupDevice) {
  return !!(c?.adb && c.helper && c.accessibility);
}

export const FRESH_CHECK_MS = 2 * 3600_000;
type FreshRow = { app_checks: AppChecks | null; app_checked_at: string | null; checks_used_at?: string | null };
/** A TV check counts for one screen share and only for 2 hours. */
export function checksFresh(row: FreshRow | null | undefined, now = Date.now()) {
  if (!row?.app_checked_at || !appChecksPassed(row.app_checks)) return false;
  const at = Date.parse(row.app_checked_at);
  if (now - at > FRESH_CHECK_MS) return false;
  return !row.checks_used_at || Date.parse(row.checks_used_at) < at;
}

/** Staff can only request a screen share once the TV app has confirmed setup. */
export function canRequestTicketScreenShare(setup: { completed_at: string | null } | null | undefined) {
  return !!setup?.completed_at;
}

/** Latest measured app snapshot, kept separate from the live screen-share code. */
export function remoteSetupProgress(row: { app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null }) {
  const c = row.app_checks;
  if (!row.app_checked_at || !c) return { stage: 0, title: "Waiting for TV Enabler", detail: "Finish setup in BM TV Enabler, then type the code it shows into the box above." };
  if (!c.adb) return { stage: 0, title: "Waiting for the TV connection", detail: "Enabler has reported, but the TV connection is not confirmed." };
  if (!c.helper) return { stage: 1, title: "TV connected — Helper installation next", detail: "Continue the BM Remote Helper installation step in Enabler." };
  if (!c.control) return { stage: 2, title: "BM Remote Helper installed — remote control next", detail: "Continue the remote-control installation step in Enabler." };
  if (!c.accessibility) return { stage: 3, title: "Apps installed — activation next", detail: "Continue the permission activation step in Enabler." };
  return { stage: 4, title: "TV setup confirmed by Enabler", detail: row.completed_at ? "Your TV code has also been confirmed. Open BM Remote Helper for a fresh code after a screen share ends." : "Open BM Remote Helper on the TV and enter its six-digit code above to send your screen-share request." };
}
