/* Wizard UI mirroring the phone BM TV Enabler: one step at a time, real TV checks
   before every advance, optional website linking, safe reset. */
const { Step, CodeResult, Wizard, newCode, ready: allReady, validHost, installFinished, canIssueConfirmation } = SetupWizard;
const wizard = new Wizard();

const el = id => document.getElementById(id);
const heading = el('heading'), description = el('description'), devicePick = el('device-pick'),
  deviceHelp = el('device-help'), addressBlock = el('address-block'), address = el('address'),
  scan = el('scan'), devices = el('devices'), scanStatus = el('scan-status'),
  codeBlock = el('code-block'),
  progress = el('progress'), action = el('action'), next = el('next'), reset = el('reset'), startAgain = el('start-again'), appsResult = el('apps-result'),
  pickAmazon = el('pick-amazon'), pairBlock = el('pair-block'), scanHint = el('scan-hint'), pickAndroid = el('pick-android'),
  tvCodeBlock = el('tv-code-block'), linkBlock = el('link-block'), linkCode = el('link-code'), tvCodeInput = el('tv-code'), showAgain = el('show-again'),
  appsPick = el('apps-pick'), appsNew = el('apps-new'), appsHave = el('apps-have'), appsBack = el('apps-back'),
  pairButton = el('pair'), pairCode = el('pair-code'), pairPort = el('pair-port');

let device = null, checks = null, busy = false, confirmCode = '', appsResults = [];
let confirmExpiresAt = 0;
let confirmationUsed = false;
let sharingReferenceExpired = false;
let refreshToken = '', refreshHost = '', refreshBusy = false;
// Install and sharing references are independent; sharing can expire early when its session ends.
let installCode = '', installExpiresAt = 0, installUsed = false, installRefreshToken = '';
// After installing: 0 = not asked yet, 1 = needs staff help (show code), 2 = self install (logged).
let installChoice = 0;
// Staff-help ticket after installing: 0 none, 1 opened + screen share sent to staff, 2 opened (share not linked), 3 failed.
let helpTicket = 0, helpTicketError = '';
let handoffApps = null, handoffTicket = null, handoffPurpose = 'install'; // answers loaded from a bmsupport.uk code
let helpPlan = Number(localStorage.getItem('bm-tv-help-plan')) || 0; // asked before installing: 1 staff help, 2 self install
const helpYes = document.getElementById('help-yes'), helpNo = document.getElementById('help-no');
function saveInstallState(patch) { try { const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation-install') || 'null'); if (saved) localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ ...saved, ...patch })); } catch { /* ignore */ } }
const welcomeSection = el('welcome'), wizardSection = el('wizard');
const startButton = document.getElementById('welcome-start'), pinInput = el('pin-input'), pinMsg = el('pin-msg');
// The PIN is asked every time the app is opened.
let pinOkThisRun = false;
const loggedIn = () => pinOkThisRun;
startButton.addEventListener('click', async () => {
  if (!loggedIn()) {
    startButton.disabled = true; pinMsg.textContent = 'Checking your PIN…';
    try {
      const r = await window.bmTv.login(pinInput.value.trim());
      localStorage.setItem('bm-pin-token', r.token); localStorage.setItem('bm-pin-expires', String(r.expiresAtMs)); pinOkThisRun = true; el('pin-box').hidden = true; startButton.textContent = 'Get started';
    } catch (e) { pinMsg.textContent = (e && e.message ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); startButton.disabled = false; return; }
    startButton.disabled = false;
  }
  welcomeSection.hidden = true;
  wizardSection.hidden = false;
  // Every session after the welcome/PIN starts at "What do you need?" unless a setup is mid-way.
  const validConfirmation = wizard.step === Step.DONE && confirmCode && Date.now() < confirmExpiresAt;
  if (!validConfirmation && (wizard.step === Step.DEBUGGING || wizard.step === Step.DONE)) {
    if (wizard.step === Step.DONE) { wizard.reset(); checks = null; confirmCode = ''; appsResults = []; }
    apps = null; localStorage.removeItem('bm-tv-apps'); render();
  }
  render();
  window.scrollTo(0, 0);
});
const savedAddress = localStorage.getItem('bm-tv-address');
if (savedAddress) address.value = savedAddress;
const savedDevice = localStorage.getItem('bm-tv-device');
if (savedDevice === 'amazon' || savedDevice === 'android') device = savedDevice;
let apps = localStorage.getItem('bm-tv-apps');
if (apps !== 'new' && apps !== 'have') apps = null;
/** Restore the original reference and its usage without restarting TV setup. */
function restoreConfirmation() {
  try {
    const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation') || 'null');
    const savedType = saved && (saved.device || localStorage.getItem('bm-tv-device'));
    if (!saved || !validHost(saved.host || '') || !savedType || !wizard.resumeConfirmation(saved.code, saved.expiresAtMs)) return false;
    device = savedType; confirmCode = saved.code; confirmExpiresAt = saved.expiresAtMs;
    confirmationUsed = saved.referenceUsed === true;
    refreshToken = /^[0-9a-f]{64}$/.test(saved.refreshToken || '') ? saved.refreshToken : '';
    refreshHost = saved.host; address.value = saved.host; apps = 'have';
    checks = { adb: true, helper: true, control: true, accessibility: true, type: device };
    return true;
  } catch { localStorage.removeItem('bm-tv-confirmation'); return false; }
}
restoreConfirmation();
/** Restore the install reference: it has no expiry and is replaced once used or logged. */
function restoreInstallConfirmation() {
  try {
    const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation-install') || 'null');
    if (!saved || !validHost(saved.host || '') || !/^[A-Z0-9]{6}$/.test(saved.code || '') || !Number.isFinite(saved.expiresAtMs) || saved.expiresAtMs <= Date.now()) return false;
    installCode = saved.code; installExpiresAt = saved.expiresAtMs; installUsed = saved.referenceUsed === true; installChoice = saved.choice === 1 || saved.choice === 2 ? saved.choice : 0;
    installRefreshToken = /^[0-9a-f]{64}$/.test(saved.refreshToken || '') ? saved.refreshToken : '';
    return true;
  } catch { localStorage.removeItem('bm-tv-confirmation-install'); return false; }
}
restoreInstallConfirmation();
const confirmationValid = () => Boolean(confirmCode) && Date.now() < confirmExpiresAt;

function say(text, isError) {
  progress.textContent = text;
  progress.classList.toggle('error', Boolean(isError));
  el('connection-notice').hidden = wizard.step !== Step.CHECK && !text;
}

function setBusy(value) {
  busy = value;
  for (const b of [action, next, reset, startAgain, scan, pickAmazon, pickAndroid, showAgain, pairButton, appsNew, appsHave, appsBack, el('apps-code')]) b.disabled = value;
  address.disabled = value; tvCodeInput.disabled = value; linkCode.disabled = value; pairCode.disabled = value; pairPort.disabled = value;
  devices.querySelectorAll('button').forEach(b => { b.disabled = value; });
}

function pickDevice(value) {
  if (busy) return;
  device = value;
  localStorage.setItem('bm-tv-device', value);
  // Debugging was already confirmed on this TV: go straight to Connect with the saved address.
  if (wizard.step === Step.DEBUGGING && apps && validHost(address.value.trim())) wizard.confirmDebugging();
  render();
}

const DEBUG_HELP = {
  amazon: 'Put this computer and your Fire TV on the same home network (avoid guest Wi-Fi and disconnect any VPN).\n\nOn the Fire TV: Settings › My Fire TV › About — press the device name 7 times. Go back to My Fire TV › Developer options and switch ADB debugging ON.',
  android: 'Put this computer and your TV on the same home network (avoid guest Wi-Fi and disconnect any VPN).\n\nOn the TV: Settings › System › About — press Android TV OS build 7 times. Go back to System › Developer options and switch Network debugging ON, or Wireless debugging ON if your TV has that instead.',
};
const DESCRIPTIONS = {
  [Step.DEBUGGING]: '',
  [Step.CHECK]: 'Type the TV\'s address from its network settings, or press Find my TV and pick yours from the list.\n\nWhen the TV asks, tick Always allow and press Allow. Setup then runs by itself.',
  [Step.TV_CODE]: 'Look at your TV — the 4-digit code is now on screen (on Android / Google TV it shows as the TV\'s device name on the About page). Type it below so we know this is your TV. After that, setup runs by itself.',
  [Step.SETUP]: 'We check what\'s already on the TV, install BM Remote Helper and remote control if needed, switch remote control on, then check everything again. Keep both devices awake.',
};

function render() {
  const s = wizard.step;
  const askApps = s === Step.DEBUGGING && apps == null;
  const install = apps === 'new';
  const installDone = installFinished(s, apps);
  const supportDone = s === Step.DONE && !install;
  // Presentation follows the actual wizard; it never advances TV checks.
  const stepIndex = s === Step.DEBUGGING ? 0 : s === Step.CHECK ? 1 : s === Step.TV_CODE ? 1 : s === Step.SETUP ? 2 : 3;
  el('step-progress').hidden = askApps || (s === Step.DEBUGGING && device == null);
  el('step-label').textContent = s === Step.DONE ? 'Setup complete' : `Step ${stepIndex + 1} of 4`;
  document.querySelectorAll('.step-track span').forEach((segment, index) => {
    segment.classList.toggle('complete', index < stepIndex || s === Step.DONE);
    segment.classList.toggle('current', index === stepIndex && s !== Step.DONE);
  });
  el('connection-notice').hidden = s !== Step.CHECK && !progress.textContent;
  el('connection-notice').querySelector('p').hidden = s !== Step.CHECK;
  reset.hidden = installDone; startAgain.hidden = askApps;
  const pick = (s === Step.DEBUGGING && !askApps && device == null) || (s === Step.DONE && !install && device == null && !confirmCode);
  appsPick.hidden = !askApps; appsBack.hidden = true; // Return to home already covers going back to the options.
  devicePick.hidden = !pick;
  deviceHelp.hidden = !pick;
  addressBlock.hidden = s !== Step.CHECK;
  tvCodeBlock.hidden = s !== Step.TV_CODE;
  const shownCode = install ? installCode : confirmCode;
  const shownExpiry = install ? installExpiresAt : confirmExpiresAt;
  const asking = install && installDone && Boolean(installCode) && installChoice === 0;
  helpYes.hidden = !asking; helpNo.hidden = !asking; helpYes.disabled = busy; helpNo.disabled = busy;
  codeBlock.hidden = !(s === Step.DONE && shownCode) || (install && installChoice !== 1);
  linkBlock.hidden = !(s === Step.DONE && wizard.ready) || install;
    const expired = sharingReferenceExpired || (Boolean(confirmCode) && Date.now() >= confirmExpiresAt);
  codeBlock.textContent = shownCode && Date.now() >= shownExpiry ? 'Expired' : shownCode ? `${shownCode.slice(0, 3)}-${shownCode.slice(3)}` : '';
  next.hidden = !(installDone && installCode) || asking;
  if (!next.hidden) {
    next.textContent = installUsed || Date.now() >= installExpiresAt ? 'New code' : 'New code — available once this one is used';
    next.disabled = busy || !canIssueConfirmation(Boolean(installCode), installExpiresAt, installUsed);
  }
  action.hidden = (s === Step.DEBUGGING && (device == null || apps == null)) || (s === Step.DONE && install);
  pairBlock.hidden = device !== 'android';
  scan.textContent = device === 'android' ? 'Find my Android TV' : 'Find my Fire TV';
  scanHint.textContent = device === 'android' ? 'Find my Android TV lists Android / Google TVs on your network (Amazon devices are left out). If yours isn\'t listed, type the address from the TV\'s network settings.' : 'Find my Fire TV lists only Amazon Fire TVs on your network, so you can pick the right one if you have more than one.';
  appsResult.hidden = !(installDone && appsResults.length);
  if (!appsResult.hidden) {
    appsResult.replaceChildren();
    for (const r of appsResults) {
      const row = document.createElement('p'); row.className = 'app-row';
      const name = document.createElement('strong'); name.textContent = r.name;
      const state = document.createElement('span');
      state.className = r.status === 'failed' ? 'app-state failed' : 'app-state';
      state.textContent = r.status === 'installed' ? 'Installed' : r.status === 'already' ? 'Already on your TV' : "Didn't install — press Return to home to try again";
      row.append(name, state); appsResult.append(row);
    }
  }
  pickAmazon.classList.toggle('selected', device === 'amazon');
  pickAndroid.classList.toggle('selected', device === 'android');
  pickAmazon.setAttribute('aria-pressed', String(device === 'amazon'));
  pickAndroid.setAttribute('aria-pressed', String(device === 'android'));
  const titles = { [Step.DEBUGGING]: '1. Enable TV debugging', [Step.CHECK]: '2. Connect to your TV', [Step.TV_CODE]: '2. Confirm your TV', [Step.SETUP]: install ? '3. Installing our apps' : '3. Setting up your TV', [Step.DONE]: 'TV setup confirmed' };
  const labels = { [Step.DEBUGGING]: 'I\'ve switched debugging on — next ', [Step.CHECK]: 'Connect to this TV ', [Step.TV_CODE]: 'Confirm code and set up my TV ', [Step.SETUP]: 'Try again ' };
  heading.textContent = titles[s];
  if (s === Step.DONE && install) {
    heading.textContent = helpPlan === 1 && helpTicket ? 'Staff help is on the way' : 'Your apps are installed';
    const live = installCode && Date.now() < installExpiresAt;
    description.textContent = helpPlan === 1 && helpTicket
      ? (helpTicket === 1
        ? '✓ We\'ve opened a support ticket for you and set up screen sharing. Our staff will connect to your TV shortly and install the apps for you — keep the TV switched on with BM Remote Helper on screen. You can follow your ticket at bmsupport.uk › Tickets.'
        : helpTicket === 2
        ? '✓ We\'ve opened a support ticket for you at bmsupport.uk › Tickets. Open its Remote setup tab and press Connect so our staff can see your TV.'
        : `We couldn't open a ticket for staff help: ${helpTicketError}\n\nPress Return to home and choose Install our apps again, or open a ticket at bmsupport.uk.`)
      : live && installChoice === 0
      ? 'Each app is listed below with what happened.\n\nDo you need help from our staff with your apps?'
      : live && installChoice === 2
      ? "Each app is listed below with what happened.\n\n✓ Your install has been recorded — no staff help needed. You can close this app. Press New code if you install again."
      : live
      ? "Each app is listed below with what happened.\n\nType the code shown into the Remote setup tab on your ticket or order at bmsupport.uk so our staff can help. The code doesn't run out — once it's used, press New code for your next install."
      : installCode
      ? 'Each app is listed below with what happened. Your install code has expired — press New code for a fresh one.'
      : 'Each app is listed below with what happened. You can close this app, or press Return to home to do something else.';
  } else if (s === Step.DONE) {
    deviceHelp.textContent = 'Which TV is this? Choose the same type as your ticket or order.';
    const minutes = Math.max(0, Math.ceil((confirmExpiresAt - Date.now()) / 60000));
    heading.textContent = expired ? 'Confirmation code expired' : 'TV setup confirmed';
    description.textContent = expired ? 'This sharing reference has expired. Press New code, then enter the new reference on your ticket or order to share again.' : confirmCode
      ? `Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. It expires when screen sharing ends or the ticket/order closes. You will need a new reference to share again.\n\nMaximum time remaining: ${Math.floor(minutes / 60)}h ${minutes % 60}m.\n\nThen press Connect on that tab to request screen sharing.`
      : 'Your TV is ready. Get your confirmation code, then type it on your ticket or order\'s Remote setup tab.';
    action.firstChild.textContent = expired ? 'New code ' : confirmCode ? (confirmationUsed ? 'New code ' : 'New code — available after use or expiry ') : 'Get my confirmation code ';
    if (!expired && confirmationUsed) description.textContent += '\n\nThis reference has been used on a ticket or order. Press New code for your next ticket or order — each one needs its own code.';
    if (!expired && confirmCode) description.textContent += '\n\nNeed apps installed too? Press Return to home — this code is kept until it expires.';
  } else if (askApps) {
    heading.textContent = 'Enter your website code';
    description.textContent = "Get your code from bmsupport.uk: your support ticket's Remote setup tab, or your order's install or staff-help option. Press I have a website code and type it in.";
  } else if (s === Step.DEBUGGING) {
    heading.textContent = device ? '1. Enable TV debugging' : 'Which TV is your order or support for?';
    deviceHelp.textContent = 'Choose Amazon Fire TV or Android / Google TV to see the right steps.';
    description.textContent = device ? DEBUG_HELP[device] : '';
    action.firstChild.textContent = labels[s];
  } else {
    description.textContent = DESCRIPTIONS[s];
    action.firstChild.textContent = labels[s];
  }
  setBusy(busy);
  if (supportDone && !canIssueConfirmation(Boolean(confirmCode), confirmExpiresAt, confirmationUsed) && !linkCode.value.trim()) action.disabled = true;
}

function cleanError(error) {
  return String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
}

async function showCode(host, existing) {
  const code = existing ?? newCode();
  localStorage.setItem('bm-tv-address', host);
  setBusy(true);
  say('Connecting… keep this app open and watch your TV for an Allow box.');
  try {
    await window.bmTv.showCode(host, code);
    say('✓ Connected to your TV. Setting it up now…');
    setBusy(false); wizard.paired(); render(); run(Step.SETUP, host); return;
  } catch (error) { say(cleanError(error), true); }
  setBusy(false); render();
}

/** Tick list of our apps (already-installed unticked and greyed out). Resolves with the ticked app paths. */
function chooseApps(list) {
  const box = document.getElementById('apps-choose'), holder = document.getElementById('apps-choose-list'), go = document.getElementById('apps-choose-go');
  holder.replaceChildren();
  const boxes = [];
  for (const app of list) {
    const label = document.createElement('label'); const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = !app.installed; input.value = app.path;
    const name = document.createElement('strong'); name.textContent = app.name;
    label.append(input, name);
    if (app.installed) { input.disabled = true; label.className = 'disabled'; const note = document.createElement('small'); note.textContent = 'Already installed'; label.append(note); }
    else boxes.push(input);
    holder.append(label);
  }
  const sync = () => { const n = boxes.filter(b => b.checked).length; go.disabled = n === 0; go.textContent = n ? `Install ${n} ticked app${n === 1 ? '' : 's'}` : 'Tick at least one app'; };
  boxes.forEach(b => b.addEventListener('change', sync));
  if (!boxes.length) { go.disabled = false; go.textContent = 'Continue — everything is already installed'; } else sync();
  box.hidden = false;
  return new Promise(resolve => {
    go.onclick = () => { box.hidden = true; go.onclick = null; resolve(boxes.filter(b => b.checked).map(b => b.value)); };
  });
}

async function run(stage, host) {
  setBusy(true);
  say(stage === Step.DONE ? 'Getting your confirmation code…' : 'Checking your TV…');
  try {
    if (stage === Step.DONE) {
      if (!checks || !wizard.ready) { say('Check the TV again first.', true); return; }
      if (device == null) { say('Choose which TV this is first.', true); return; }
      const link = linkCode.value.replace(/\D/g, '');
      if (link.length === 8) {
        await window.bmTv.linkReport(link, checks, device, host);
        say('✓ Sent to your ticket or order. On the website, press Connect.');
      } else {
        const issued = await window.bmTv.confirmCode(checks, device, host);
        confirmCode = issued.code; confirmExpiresAt = issued.expiresAtMs;
        confirmationUsed = false; sharingReferenceExpired = false;
        refreshToken = issued.refreshToken || ''; refreshHost = host;
        localStorage.setItem('bm-tv-confirmation', JSON.stringify({ code: confirmCode, expiresAtMs: confirmExpiresAt, refreshToken, host, device, referenceUsed: false }));
        if (handoffPurpose === 'support' && handoffTicket) {
          await window.bmTv.ticketSupport(handoffTicket, refreshToken);
          say('✓ TV linked to your existing support ticket. Press Connect my screen on the website so staff can investigate your issue.');
          return;
        }
        say('✓ Code ready. Type it on your ticket or order\'s Remote setup tab.');
      }
    } else {
      if (apps === 'new') {
        if (helpPlan === 1) appsResults = []; // Staff help: our staff install the apps themselves.
        else {
          let only = handoffApps;
          if (!only) { const list = await window.bmTv.listApps(host); say('Choose which apps to install, then press Install ticked apps.'); only = await chooseApps(list); }
          say('Installing your chosen apps…');
          const result = await window.bmTv.installApps(host, only);
          appsResults = result.results || [];
        }
        wizard.setupFinished(true);
        if (helpPlan === 1) {
          // Staff help: set up screen sharing first, then open the ticket with it attached.
          try {
            say('Setting up screen sharing so our staff can help…');
            let c = await window.bmTv.check(host);
            const ok = () => allReady(c.adb, c.helper, c.control, c.accessibility);
            if (!ok()) {
              if (!c.helper) await window.bmTv.installHelper(host);
              if (!c.control) await window.bmTv.installControl(host);
              await window.bmTv.activate(host);
              c = await window.bmTv.check(host);
            }
            if (!ok()) throw new Error('Screen sharing couldn\'t be switched on for this TV.');
            const dev = c.type === 'amazon' || c.type === 'android' ? c.type : device;
            const share = await window.bmTv.confirmCode(c, dev, host);
            say('Opening a support ticket for our staff…');
            const t = await window.bmTv.staffTicket(share.refreshToken || '', dev, appsResults.filter(r => r.status !== 'failed').map(r => r.name), handoffTicket);
            helpTicket = t && t.connected ? 1 : 2; helpTicketError = '';
            checks = c; confirmCode = share.code; confirmExpiresAt = share.expiresAtMs; confirmationUsed = true; sharingReferenceExpired = false;
            refreshToken = share.refreshToken || ''; refreshHost = host;
            localStorage.setItem('bm-tv-confirmation', JSON.stringify({ code: confirmCode, expiresAtMs: confirmExpiresAt, refreshToken, host, device: dev, referenceUsed: true }));
          } catch (error) { helpTicket = 3; helpTicketError = cleanError(error); }
          say(helpTicket === 1 ? '✓ Apps installed, screen sharing set up and a ticket opened for our staff.' : helpTicket === 2 ? '✓ Apps installed and a ticket opened for our staff.' : `Apps installed, but we couldn't open the staff ticket: ${helpTicketError}`, helpTicket === 3);
          return;
        }
        if (!result.failed.length) {
          say('Confirming the installation…');
          try {
            const verify = await window.bmTv.check(host);
            const dev = verify.type === 'amazon' || verify.type === 'android' ? verify.type : device;
            const issued = await window.bmTv.confirmCode({ adb: true, helper: verify.helper, control: verify.control, accessibility: false }, dev, host, 'install');
            installCode = issued.code; installExpiresAt = issued.expiresAtMs; installUsed = false;
            installRefreshToken = issued.refreshToken || '';
            localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ code: installCode, expiresAtMs: installExpiresAt, refreshToken: installRefreshToken, host, device: dev, referenceUsed: false, choice: 0 }));
            installChoice = helpPlan === 1 ? 1 : 0;
            if (helpPlan === 1) saveInstallState({ choice: 1 });
            if (helpPlan === 2) setTimeout(() => selfInstall(true), 0);
          } catch { /* The apps are on the TV either way; the code is extra proof for the ticket or order. */
            if (helpPlan === 2) setTimeout(() => selfInstall(true), 0);
          }
        } else if (helpPlan === 2) setTimeout(() => selfInstall(true), 0);
        say(result.failed.length ? `Done, but ${result.failed.length} app${result.failed.length === 1 ? '' : 's'} didn't install — see the list below. Press Return to home to try again.` : `✓ All done — ${result.installed.length} app${result.installed.length === 1 ? '' : 's'} on your TV. See the list below.`, result.failed.length > 0);
        return;
      }
      checks = await window.bmTv.check(host);
      const isReadyNow = () => allReady(checks.adb, checks.helper, checks.control, checks.accessibility);
      if (!isReadyNow()) {
        if (!checks.helper) await window.bmTv.installHelper(host);
        if (!checks.control) await window.bmTv.installControl(host);
        await window.bmTv.activate(host);
        say('Checking everything on the TV one last time…');
        checks = await window.bmTv.check(host);
      }
      const ok = isReadyNow();
      wizard.setupFinished(ok);
      if (ok && handoffPurpose === 'support' && handoffTicket) {
        const issued = await window.bmTv.confirmCode(checks, device, host);
        confirmCode = issued.code; confirmExpiresAt = issued.expiresAtMs;
        refreshToken = issued.refreshToken || ''; refreshHost = host; confirmationUsed = false;
        localStorage.setItem('bm-tv-confirmation', JSON.stringify({ code: confirmCode, expiresAtMs: confirmExpiresAt, refreshToken, host, device, referenceUsed: false }));
        await window.bmTv.ticketSupport(handoffTicket, refreshToken);
        say('✓ TV linked to your support ticket. Press Connect my screen on the website.');
        return;
      }
      if (checks.type === 'amazon' || checks.type === 'android') { device = checks.type; localStorage.setItem('bm-tv-device', device); }
      say(ok ? '✓ TV setup confirmed: both apps installed and remote control switched on.' : 'The TV is not fully ready yet. Press Try again.', !ok);
    }
  } catch (error) {
    say(cleanError(error), true);
  } finally {
    setBusy(false);
    render();
  }
}

action.addEventListener('click', () => {
  if (busy || refreshBusy) return;
  const s = wizard.step;
  if (s === Step.DONE && !linkCode.value.trim() && !canIssueConfirmation(Boolean(confirmCode), confirmExpiresAt, confirmationUsed)) return;
  if (s === Step.DEBUGGING) { wizard.confirmDebugging(); say(''); render(); return; }
  const host = address.value.trim();
  if (!validHost(host)) { say('Type the TV\'s address exactly as it shows on the TV, e.g. 192.168.1.25.', true); return; }
  if (s === Step.CHECK) { showCode(host); return; }
  if (s === Step.TV_CODE) {
    const r = wizard.enterCode(tvCodeInput.value);
    if (r === CodeResult.WRONG) { say('That\'s not the code on this TV. Check the TV screen and try again.', true); return; }
    if (r === CodeResult.RESET) { tvCodeInput.value = ''; say('That code didn\'t match 3 times, so we\'ve disconnected. Check you\'ve picked the right TV and connect again.', true); render(); return; }
    tvCodeInput.value = ''; render();
  }
  run(wizard.step, host);
});

pairButton.addEventListener('click', async () => {
  if (busy || wizard.step !== Step.CHECK) return;
  const host = address.value.trim();
  if (!validHost(host) || !host.includes(':')) { say('In TV address, type the IP address & Port from the Wireless debugging screen, e.g. 192.168.1.25:41235.', true); return; }
  const code = pairCode.value.replace(/\D/g, ''), port = pairPort.value.replace(/\D/g, '');
  if (code.length !== 6 || !port) { say('Type the 6-digit code and the pairing port shown on the TV.', true); return; }
  localStorage.setItem('bm-tv-address', host);
  setBusy(true);
  try { await window.bmTv.pair(host.split(':')[0], Number(port), code); }
  catch (error) { setBusy(false); say(cleanError(error), true); return; }
  setBusy(false); pairCode.value = ''; wizard.paired(); render(); run(Step.SETUP, host);
});

showAgain.addEventListener('click', () => { if (!busy && wizard.tvCode) showCode(address.value.trim(), wizard.tvCode); });

next.addEventListener('click', async () => {
  if (busy || !installFinished(wizard.step, apps) || !canIssueConfirmation(Boolean(installCode), installExpiresAt, installUsed)) return;
  const host = address.value.trim();
  if (!validHost(host)) { say('Type the TV\'s address first.', true); return; }
  setBusy(true); say('Checking your TV…');
  try {
    const verify = await window.bmTv.check(host);
    const dev = verify.type === 'amazon' || verify.type === 'android' ? verify.type : device;
    const issued = await window.bmTv.confirmCode({ adb: true, helper: verify.helper, control: verify.control, accessibility: false }, dev, host, 'install');
    installCode = issued.code; installExpiresAt = issued.expiresAtMs; installUsed = false;
    installRefreshToken = issued.refreshToken || '';
    localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ code: installCode, expiresAtMs: installExpiresAt, refreshToken: installRefreshToken, host, device: dev, referenceUsed: false, choice: 0 }));
    installChoice = 0;
    say('✓ New install code ready.');
  } catch (error) { say(cleanError(error), true); }
  setBusy(false); render();
});
/** A finished app-install run goes back to "What do you need?" — the saved TV address,
 *  device choice and TV authorization are kept, so nothing restarts from scratch. */
function backToStart() {
  if (busy) return;
  // The saved screen-share reference (code, expiry, refresh token, TV) is kept until it expires.
  wizard.reset(); apps = null; appsResults = []; document.getElementById('apps-choose').hidden = true;
  if (!confirmationValid()) checks = null;
  localStorage.removeItem('bm-tv-apps');
  say(''); render();
}
startAgain.addEventListener('click', backToStart);
helpYes.addEventListener('click', () => { if (busy) return; installChoice = 1; saveInstallState({ choice: 1 }); say(''); render(); });
helpNo.addEventListener('click', () => selfInstall(false));
async function selfInstall(auto) {
  const hasToken = /^[0-9a-f]{64}$/.test(installRefreshToken || '');
  if ((busy && !auto) || (!hasToken && helpPlan !== 2)) return;
  setBusy(true); say('Recording your install…');
  try {
    await window.bmTv.selfInstall(hasToken ? installRefreshToken : undefined, appsResults.filter(r => r.status !== 'failed').map(r => r.name), address.value.trim());
    installChoice = 2; installUsed = true; saveInstallState({ choice: 2, referenceUsed: true });
    say('✓ Install recorded. You\'re all set.');
  } catch (error) { say(cleanError(error), true); }
  setBusy(false); render();
}

reset.addEventListener('click', () => {
  if (busy) return;
  if (!window.confirm('Reset setup?\n\nThis can\'t be undone. Your saved TV address, device choice and BM TV Enabler reference codes will be cleared, and the new code you create next takes over from the old one. Installed TV apps and this computer\'s TV authorization are kept.\n\nPress OK to confirm the reset.')) return;
  wizard.reset(); checks = null; device = null; apps = null; confirmCode = ''; appsResults = []; document.getElementById('apps-choose').hidden = true;
  confirmExpiresAt = 0; refreshToken = ''; refreshHost = '';
  sharingReferenceExpired = false;
  installCode = ''; installExpiresAt = 0; installUsed = false; installRefreshToken = ''; installChoice = 0;
  localStorage.removeItem('bm-tv-confirmation');
  localStorage.removeItem('bm-tv-confirmation-install');
  localStorage.removeItem('bm-tv-address'); localStorage.removeItem('bm-tv-device'); localStorage.removeItem('bm-tv-apps');
  address.value = ''; say(''); render();
});
function pickApps(value) {
  if (busy) return;
  handoffPurpose = 'install'; handoffTicket = null; handoffApps = null;
  if (value === 'have' && restoreConfirmation()) { localStorage.setItem('bm-tv-apps', value); say(''); render(); return; }
  // Install our apps always runs a fresh install — an old install code never skips it.
  if (value === 'new') { handoffApps = null; handoffTicket = null; installCode = ''; installExpiresAt = 0; installUsed = false; installRefreshToken = ''; installChoice = 0; helpTicket = 0; helpTicketError = ''; appsResults = []; }
  apps = value; if (value) localStorage.setItem('bm-tv-apps', value); else localStorage.removeItem('bm-tv-apps');
  // The TV type is its own question straight after "What do you need?", asked every time.
  if (value) { device = null; localStorage.removeItem('bm-tv-device'); }
  render();
}
appsNew.addEventListener('click', () => { if (!busy) el('help-ask').showModal(); });
function choosePlan(plan) { helpPlan = plan; localStorage.setItem('bm-tv-help-plan', String(plan)); pickApps('new'); }
el('help-ask-no').addEventListener('click', () => { el('help-ask').close(); choosePlan(2); });
// Staff help needs the office open: check first, before anything installs.
el('help-ask-yes').addEventListener('click', async () => {
  el('help-ask').close();
  if (busy) return;
  setBusy(true); say('Checking our office is open…');
  let open = false;
  try { open = await window.bmTv.officeOpen(); } catch (error) { setBusy(false); say(cleanError(error), true); return; }
  setBusy(false); say('');
  if (open) { choosePlan(1); return; }
  if (window.confirm('Our office is closed\n\nStaff help is only available during office hours. Press OK to install the apps yourself now, or Cancel to come back when we\'re open.')) choosePlan(2);
});
el('apps-code').addEventListener('click', () => { if (!busy) { el('code-ask-input').value = ''; el('code-ask').showModal(); } });
el('code-ask-cancel').addEventListener('click', () => el('code-ask').close());
el('code-ask-ok').addEventListener('click', async () => {
  const code = el('code-ask-input').value.replace(/\D/g, '');
  el('code-ask').close();
  if (busy) return;
  setBusy(true); say('Checking your code…');
  try {
    const h = await window.bmTv.handoff(code);
    setBusy(false);
    helpPlan = h.helpPlan; localStorage.setItem('bm-tv-help-plan', String(h.helpPlan));
    // A new website handoff must not restore another ticket's old confirmation.
    apps = h.purpose === 'support' ? 'have' : 'new';
    wizard.reset(); confirmCode = ''; refreshToken = ''; confirmationUsed = false;
    localStorage.setItem('bm-tv-apps', apps);
    handoffPurpose = h.purpose;
    handoffApps = h.helpPlan === 2 ? h.apps : null; handoffTicket = h.ticketId;
    pickDevice(h.device);
    say(`✓ Code accepted. ${h.purpose === 'support' ? "We'll connect your TV to your existing ticket so staff can solve your issue." : h.helpPlan === 1 ? "We'll set up screen sharing for staff to install your apps." : "We'll install the apps you ticked."}`);
  } catch (error) { setBusy(false); say(cleanError(error), true); }
});
el('help-ask-cancel').addEventListener('click', () => el('help-ask').close());
appsHave.addEventListener('click', () => pickApps('have'));
appsBack.addEventListener('click', () => pickApps(null));
pickAmazon.addEventListener('click', () => pickDevice('amazon'));
pickAndroid.addEventListener('click', () => pickDevice('android'));
async function runScan(all) {
  if (busy) return;
  setBusy(true); devices.replaceChildren(); scanStatus.textContent = all ? 'Looking for every device on your home network…' : 'Looking for TVs on your home network…';
  try {
    const found = await window.bmTv.scan(all ? 'all' : device);
    scanStatus.textContent = found.length ? (all ? `${found.length} device${found.length === 1 ? '' : 's'} found. Greyed-out ones can't be set up.` : `${found.length} TV${found.length === 1 ? '' : 's'} found. Select the one you want.`)
      : all ? 'Nothing answered on this network. Check both devices are on the same home network, then type the TV address.' : 'No TVs found. Some TVs don\'t announce themselves — try Show all devices, or type the TV address.';
    for (const tv of found) {
      const locked = all && !tv.debugging;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'device';
      const label = document.createElement('span'); label.textContent = tv.name;
      const ip = document.createElement('small'); ip.textContent = tv.address; label.append(ip);
      const state = document.createElement('span'); state.className = tv.debugging ? 'state' : 'state unreachable';
      state.textContent = locked ? 'Can\'t be set up — debugging is off or it isn\'t a TV' : tv.debugging ? 'Debugging reachable' : 'Debugging not reachable — check switch';
      button.append(label, state);
      if (locked) { button.disabled = true; button.dataset.locked = '1'; button.style.opacity = '0.45'; }
      else button.addEventListener('click', () => { devices.querySelectorAll('button').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); }); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); address.value = tv.address; });
      button.setAttribute('aria-pressed', 'false'); devices.append(button);
    }
    if (!found.length && !all) {
      const more = document.createElement('button'); more.type = 'button'; more.textContent = 'Show all devices';
      more.addEventListener('click', () => runScan(true)); devices.append(more);
    }
  } catch (error) { scanStatus.textContent = cleanError(error); }
  finally { setBusy(false); devices.querySelectorAll('button[data-locked]').forEach(b => { b.disabled = true; }); }
}
scan.addEventListener('click', () => runScan(false));
window.bmTv.progress(text => say(text));
render();
setInterval(() => { if (wizard.step === Step.DONE && (confirmCode || installCode) && !busy) render(); }, 1000);
async function checkReferences() {
  if (busy || refreshBusy || document.hidden) return;
  refreshBusy = true;
  const token = refreshToken;
  try {
    if (token && Date.now() < confirmExpiresAt) {
      const result = await window.bmTv.refresh(refreshHost, token);
      if (token === refreshToken) {
        if (result.expired === true) {
          confirmCode = ''; confirmExpiresAt = 0; refreshToken = ''; confirmationUsed = false;
          sharingReferenceExpired = true;
          localStorage.removeItem('bm-tv-confirmation');
          say('Sharing reference expired. Press New code before sharing again.');
          render();
          return;
        }
        if (result.referenceUsed === true) {
          confirmationUsed = true;
          const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation') || 'null');
          if (saved && saved.refreshToken === token) localStorage.setItem('bm-tv-confirmation', JSON.stringify({ ...saved, referenceUsed: true }));
        }
        if (result.done) say('✓ New TV connection sent. Press Connect on your ticket or order.');
      }
    }
  } catch (error) { say(cleanError(error), true); }
  finally { refreshBusy = false; }
  // The install reference only needs its usage check — renewals never apply to it.
  try {
    if (installRefreshToken && !installUsed && Date.now() < installExpiresAt) {
      const result = await window.bmTv.refresh(address.value.trim(), installRefreshToken);
      if (result.referenceUsed === true) {
        installUsed = true;
        const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation-install') || 'null');
        if (saved && saved.refreshToken === installRefreshToken) localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ ...saved, referenceUsed: true }));
        say('✓ Install reference used on your ticket or order. New code is now available.');
        render();
      }
    }
  } catch { /* install usage check is best-effort */ }
  finally { refreshBusy = false; }
}
setInterval(checkReferences, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReferences(); });
window.addEventListener('focus', checkReferences);
