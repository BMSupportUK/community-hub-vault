export type SetupDevice = "amazon" | "android";
export type AppChecks = { adb?: boolean; helper?: boolean; control?: boolean; accessibility?: boolean };
/** What proves a step: a check reported by BM TV Enabler / BM Support app, the app report itself, or the live Helper code. */
export type StepProof = "adb" | "helper" | "accessibility" | "reported" | "code";
export type SetupStep = { title: string; body: string; proof: StepProof };

export const REMOTE_SETUP_STEPS: Record<SetupDevice, SetupStep[]> = {
  amazon: [
    { title: "Turn on developer options and ADB debugging", body: "On your Fire TV go to Settings › My Fire TV › About and press the device name 7 times. Then Settings › My Fire TV › Developer options › ADB debugging ON.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler, connect to your Fire TV and press Allow on the TV. The app then sets everything up by itself. When it confirms your TV, type the code the app shows into the “Type the code from BM TV Enabler” box at the top of this page.", proof: "accessibility" },
    { title: "Send your screen-share request", body: "BM TV Enabler brings your TV connection here automatically. Press Connect when ready. For another session, press Get new connection and keep Enabler open on the same Wi-Fi as your TV.", proof: "code" },
  ],
  android: [
    { title: "Turn on developer options and debugging", body: "On your TV go to Settings › System › About and press Android TV OS build 7 times. Then Settings › System › Developer options and switch ON Network debugging — or Wireless debugging if that's what your TV has. Leave it switched on. Using the Windows app with Wireless debugging? You can also choose Pair device with pairing code on the TV and type that code into the app.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler, type your TV's address, connect and press Allow on the TV. The app then sets everything up by itself. When it confirms your TV, type the code the app shows into the “Type the code from BM TV Enabler” box at the top of this page.", proof: "accessibility" },
    { title: "Send your screen-share request", body: "BM TV Enabler brings your TV connection here automatically. Press Connect when ready. For another session, press Get new connection and keep Enabler open on the same Wi-Fi as your TV.", proof: "code" },
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

export const FRESH_CHECK_MS = 24 * 3600_000;
type FreshRow = { app_checks: AppChecks | null; app_checked_at: string | null; checks_used_at?: string | null };
/** A TV check counts for one screen share and only for 24 hours. */
export function checksFresh(row: FreshRow | null | undefined, now = Date.now()) {
  if (!row?.app_checked_at || !appChecksPassed(row.app_checks)) return false;
  const at = Date.parse(row.app_checked_at);
  if (now - at > FRESH_CHECK_MS) return false;
  return !row.checks_used_at || Date.parse(row.checks_used_at) < at;
}

/** The Enabler-delivered session must be new, not the last consumed connection. */
export function connectionReady(row: (FreshRow & { pending_session_id?: string | null; verified_session_id?: string | null }) | null | undefined, now = Date.now()) {
  return !!row?.pending_session_id && row.pending_session_id !== row.verified_session_id && checksFresh(row, now);
}

/** Staff progress records successful setup even after Connect consumes its check.
 * Presentation only: never use this to authorize another connection. */
export function staffRemoteSetupReady(row: (FreshRow & { completed_at: string | null }) | null | undefined, now = Date.now()) {
  return !!row?.completed_at || checksFresh(row, now);
}

/** Staff can only request a screen share once the TV app has confirmed setup. */
export function canRequestTicketScreenShare(setup: { completed_at: string | null } | null | undefined) {
  return !!setup?.completed_at;
}

/** Latest measured app snapshot, kept separate from the live screen-share code. */
export function remoteSetupProgress(row: { app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null; checks_used_at?: string | null }, now = Date.now(), referenceActive = false) {
  const c = row.app_checks;
  // A valid 24-hour reference already links Enabler here: the next step is a new connection, never retyping the code.
  if (referenceActive && !checksFresh(row, now))
    return { stage: 0, title: "Your BM TV Enabler reference is still active", detail: "Press Get new connection and keep BM TV Enabler open on the same Wi-Fi as your TV. It checks your TV and brings the connection here automatically." };
  // An old or already-used check is not current: show it as needing a fresh check, not as done.
  if (row.app_checked_at && c && appChecksPassed(c) && !checksFresh(row, now))
    return { stage: 0, title: "Waiting for a fresh TV check", detail: "Your last check has been used or is over 24 hours old. Run BM TV Enabler again so it can check your TV before this screen share." };
  if (!row.app_checked_at || !c || !Object.keys(c).length) return { stage: 0, title: "Waiting for TV Enabler", detail: "Finish setup in BM TV Enabler, then type the code it shows into the box above." };
  if (!c.adb) return { stage: 0, title: "Waiting for the TV connection", detail: "Enabler has reported, but the TV connection is not confirmed." };
  if (!c.helper) return { stage: 1, title: "TV connected — Helper installation next", detail: "Continue the BM Remote Helper installation step in Enabler." };
  if (!c.control) return { stage: 2, title: "BM Remote Helper installed — remote control next", detail: "Continue the remote-control installation step in Enabler." };
  if (!c.accessibility) return { stage: 3, title: "Apps installed — activation next", detail: "Continue the permission activation step in Enabler." };
  return { stage: 4, title: "TV setup confirmed by Enabler", detail: row.completed_at ? "After a screen share ends, press Get new connection and keep BM TV Enabler open. It brings the next connection here automatically." : "Type the confirmation reference BM TV Enabler shows into the box above to confirm your TV." };
}
