export type SetupDevice = "amazon" | "android";
export type AppChecks = { adb?: boolean; helper?: boolean; control?: boolean; accessibility?: boolean };
/** What proves a step: a check reported by BM TV Enabler / BM Support app, the app report itself, or the live Helper code. */
export type StepProof = "adb" | "helper" | "accessibility" | "reported" | "code";
export type SetupStep = { title: string; body: string; proof: StepProof };

export const REMOTE_SETUP_STEPS: Record<SetupDevice, SetupStep[]> = {
  amazon: [
    { title: "Turn on developer options and ADB debugging", body: "On your Fire TV go to Settings › My Fire TV › About and press the device name 7 times. Then Settings › My Fire TV › Developer options › ADB debugging ON.", proof: "adb" },
    { title: "Install BM Remote Helper on the TV", body: "Follow Install Guides › TV Remote Enabler › Amazon to install BM Remote Helper using Downloader, then open it once.", proof: "helper" },
    { title: "Install BM TV Enabler on your phone or PC", body: "Scan the QR code on the right with your Android phone, or download the Windows version. Keep the phone or PC on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In BM TV Enabler type the setup code below, press Find my TV, pick your Fire TV, then press Turn on remote control. On the TV tick Always allow and press Allow.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "Open BM Remote Helper on the TV and type the six-digit code it shows below.", proof: "code" },
  ],
  android: [
    { title: "Turn on developer options and debugging", body: "On your TV go to Settings › Device Preferences › About and press Build 7 times. Then Developer options › turn on USB debugging (and Network / Wireless debugging if shown).", proof: "adb" },
    { title: "Install BM Remote Helper", body: "Allow unknown apps for Downloader, then follow Install Guides › TV Remote Enabler › Android / Google TV to install BM Remote Helper.", proof: "helper" },
    { title: "Install BM TV Enabler on your phone", body: "Install BM TV Enabler (or use the BM Support app › Settings › TV remote) on a phone on the same Wi-Fi as the TV.", proof: "reported" },
    { title: "Turn on remote control", body: "In the app type the setup code below and the TV address, then press Turn on remote control. On the TV tick Always allow and press Allow.", proof: "accessibility" },
    { title: "Open BM Remote Helper", body: "Open BM Remote Helper on the TV and type the six-digit code it shows below.", proof: "code" },
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
export function appChecksPassed(c: AppChecks | null | undefined) {
  return !!(c?.adb && c.helper && c.accessibility);
}

/** Staff can only request a screen share once the TV app has confirmed setup. */
export function canRequestTicketScreenShare(setup: { completed_at: string | null } | null | undefined) {
  return !!setup?.completed_at;
}
