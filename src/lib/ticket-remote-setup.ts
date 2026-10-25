export type SetupDevice = "amazon" | "android";
export type AppChecks = { adb?: boolean; helper?: boolean; control?: boolean; accessibility?: boolean };
/** What proves a step: a check reported by BM TV Enabler / BM Support app, the app report itself, or the live Helper code. */
export type StepProof = "adb" | "helper" | "accessibility" | "reported" | "code";
export type SetupStep = { title: string; body: string; proof: StepProof };

export const REMOTE_SETUP_STEPS: Record<SetupDevice, SetupStep[]> = {
  amazon: [
    { title: "Turn on developer options and ADB debugging", body: "On your Fire TV go to Settings › My Fire TV › About and press the device name 7 times. Then Settings › My Fire TV › Developer options › ADB debugging ON.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler type the setup code below, press Find my TV, pick your Fire TV, then press Turn on remote control. The app installs BM Remote Helper and remote control on the TV for you. On the TV tick Always allow and press Allow.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "BM TV Enabler opens BM Remote Helper on the TV for you. Type the six-digit code it shows below.", proof: "code" },
  ],
  android: [
    { title: "Turn on developer options and debugging", body: "On your TV go to Settings › System › About and press Android TV OS build 7 times. Then Settings › System › Developer options and switch ON Network debugging — or Wireless debugging if that's what your TV has. Leave it switched on.", proof: "adb" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler type the setup code below, press Find my TV, pick your TV, then press Turn on remote control. The app installs BM Remote Helper and remote control on the TV for you. On the TV tick Always allow and press Allow.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "BM TV Enabler opens BM Remote Helper on the TV for you. Type the six-digit code it shows below.", proof: "code" },
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

/** Staff can only request a screen share once the TV app has confirmed setup. */
export function canRequestTicketScreenShare(setup: { completed_at: string | null } | null | undefined) {
  return !!setup?.completed_at;
}
