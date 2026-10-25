export type SetupDevice = "amazon" | "android";
export type SetupStep = { title: string; body: string; appCheck?: boolean };

export const REMOTE_SETUP_STEPS: Record<SetupDevice, SetupStep[]> = {
  amazon: [
    { title: "Turn on developer options", body: "On your Fire TV go to Settings › My Fire TV › About, then press the device name 7 times until it says you are a developer." },
    { title: "Turn on ADB debugging", body: "Go back to Settings › My Fire TV › Developer options and switch ADB debugging ON. Also allow apps from unknown sources for Downloader." },
    { title: "Install BM Remote Helper on the TV", body: "Follow Install Guides › TV Remote Enabler › Amazon to install BM Remote Helper on your Fire TV using Downloader." },
    { title: "Install BM TV Enabler on your phone", body: "Scan the QR code in Install Guides › TV Remote Enabler › Amazon with your Android phone and install BM TV Enabler. Keep the phone on the same Wi-Fi as the TV." },
    { title: "Turn on remote control", body: "In BM TV Enabler press Find my TV, pick your Fire TV by name, then press Turn on remote control. On the TV tick Always allow and press Allow." },
    { title: "Open BM Remote Helper", body: "Open BM Remote Helper on the TV. It will show a six-digit code — type it below so the app can confirm to us that it is working.", appCheck: true },
  ],
  android: [
    { title: "Allow app installs", body: "On your TV go to Settings › Apps › Security & restrictions (or Device Preferences › Security) and allow installs from unknown sources for Downloader." },
    { title: "Install BM Remote Helper", body: "Follow Install Guides › TV Remote Enabler › Android / Google TV to install BM Remote Helper." },
    { title: "Allow restricted settings", body: "If Accessibility is greyed out: Settings › Apps › BM Remote Helper › ⋮ menu › Allow restricted settings." },
    { title: "Turn on Accessibility", body: "Go to Settings › Accessibility › BM Remote Helper and switch it ON, then press Allow." },
    { title: "Open BM Remote Helper", body: "Open BM Remote Helper on the TV. It will show a six-digit code — type it below so the app can confirm to us that it is working.", appCheck: true },
  ],
};

/** Staff can only request a screen share once the TV app has confirmed setup. */
export function canRequestTicketScreenShare(setup: { completed_at: string | null } | null | undefined) {
  return !!setup?.completed_at;
}

/** Every manual card must be confirmed before the app check is offered. */
export function manualStepsDone(device: SetupDevice, confirmed: number[]) {
  return REMOTE_SETUP_STEPS[device].every((s, i) => s.appCheck || confirmed.includes(i));
}
