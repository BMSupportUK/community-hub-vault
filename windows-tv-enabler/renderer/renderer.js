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
let refreshToken = '', refreshHost = '', refreshBusy = false;
// The install section gets its own reference, remembered for its 24-hour validity like the share one.
let installCode = '', installExpiresAt = 0, installUsed = false, installRefreshToken = '';
const welcomeSection = el('welcome'), wizardSection = el('wizard');
const startButton = document.getElementById('welcome-start'), pinInput = el('pin-input'), pinMsg = el('pin-msg');
const loggedIn = () => Number(localStorage.getItem('bm-pin-expires') || 0) > Date.now();
if (loggedIn()) { window.bmTv.setToken && window.bmTv.setToken(localStorage.getItem('bm-pin-token') || ''); el('pin-box').hidden = true; startButton.textContent = 'Get started'; }
startButton.addEventListener('click', async () => {
  if (!loggedIn()) {
    startButton.disabled = true; pinMsg.textContent = 'Checking your PIN…';
    try {
      const r = await window.bmTv.login(pinInput.value.trim());
      localStorage.setItem('bm-pin-token', r.token); localStorage.setItem('bm-pin-expires', String(r.expiresAtMs));
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
/** Restore the install reference the same way: it lasts 24 hours from creation. */
function restoreInstallConfirmation() {
  try {
    const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation-install') || 'null');
    if (!saved || !validHost(saved.host || '') || !/^[A-Z0-9]{6}$/.test(saved.code || '') || !Number.isFinite(saved.expiresAtMs) || saved.expiresAtMs <= Date.now()) return false;
    installCode = saved.code; installExpiresAt = saved.expiresAtMs; installUsed = saved.referenceUsed === true;
    installRefreshToken = /^[0-9a-f]{64}$/.test(saved.refreshToken || '') ? saved.refreshToken : '';
    return true;
  } catch { localStorage.removeItem('bm-tv-confirmation-install'); return false; }
}
restoreInstallConfirmation();
const confirmationValid = () => Boolean(confirmCode) && Date.now() < confirmExpiresAt;

function say(text, isError) {
  progress.textContent = text;
  progress.classList.toggle('error', Boolean(isError));
}

function setBusy(value) {
  busy = value;
  for (const b of [action, next, reset, startAgain, scan, pickAmazon, pickAndroid, showAgain, pairButton, appsNew, appsHave, appsBack]) b.disabled = value;
  address.disabled = value; tvCodeInput.disabled = value; linkCode.disabled = value; pairCode.disabled = value; pairPort.disabled = value;
  devices.querySelectorAll('button').forEach(b => { b.disabled = value; });
}

function pickDevice(value) {
  if (busy) return;
  device = value;
  localStorage.setItem('bm-tv-device', value);
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
  reset.hidden = installDone; startAgain.hidden = askApps;
  const pick = (s === Step.DEBUGGING && !askApps) || (s === Step.DONE && !install && device == null && !confirmCode);
  appsPick.hidden = !askApps; appsBack.hidden = !(s === Step.DEBUGGING && apps != null);
  devicePick.hidden = !pick;
  deviceHelp.hidden = !pick;
  addressBlock.hidden = s !== Step.CHECK;
  tvCodeBlock.hidden = s !== Step.TV_CODE;
  const shownCode = install ? installCode : confirmCode;
  const shownExpiry = install ? installExpiresAt : confirmExpiresAt;
  codeBlock.hidden = !(s === Step.DONE && shownCode);
  linkBlock.hidden = !(s === Step.DONE && wizard.ready) || install;
  const expired = Boolean(confirmCode) && Date.now() >= confirmExpiresAt;
  codeBlock.textContent = shownCode && Date.now() >= shownExpiry ? 'Expired' : shownCode ? `${shownCode.slice(0, 3)}-${shownCode.slice(3)}` : '';
  next.hidden = !(installDone && installCode);
  if (!next.hidden) {
    next.textContent = installUsed || Date.now() >= installExpiresAt ? 'New code' : 'New code — available after use or expiry';
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
  const titles = { [Step.DEBUGGING]: '1. Enable TV debugging', [Step.CHECK]: '2. Connect to your TV', [Step.TV_CODE]: '3. Type the code on your TV', [Step.SETUP]: install ? '4. Installing our apps' : '4. Setting up your TV', [Step.DONE]: 'TV setup confirmed' };
  const labels = { [Step.DEBUGGING]: 'I\'ve switched debugging on — next ', [Step.CHECK]: 'Connect to this TV ', [Step.TV_CODE]: 'Confirm code and set up my TV ', [Step.SETUP]: 'Try again ' };
  heading.textContent = titles[s];
  if (s === Step.DONE && install) {
    heading.textContent = 'Your apps are installed';
    const iMinutes = Math.max(0, Math.ceil((installExpiresAt - Date.now()) / 60000));
    description.textContent = installCode && Date.now() < installExpiresAt
      ? `Each app is listed below with what happened.\n\nType the code shown into the Remote setup tab on your ticket or order at bmsupport.uk to confirm the apps are installed. It lasts 24 hours — expires in ${Math.floor(iMinutes / 60)}h ${iMinutes % 60}m.`
      : installCode
      ? 'Each app is listed below with what happened. Your install code has expired — press New code for a fresh one.'
      : 'Each app is listed below with what happened. You can close this app, or press Return to home to do something else.';
  } else if (s === Step.DONE) {
    deviceHelp.textContent = 'Which TV is this? Choose the same type as your ticket or order.';
    const minutes = Math.max(0, Math.ceil((confirmExpiresAt - Date.now()) / 60000));
    heading.textContent = expired ? 'Confirmation code expired' : 'TV setup confirmed';
    description.textContent = expired ? 'Expired — press New code to get a fresh confirmation code.' : confirmCode
      ? `Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. You can reuse it on the same ticket or order for 24 hours.\n\nExpires in ${Math.floor(minutes / 60)}h ${minutes % 60}m.\n\nThen press Connect on that tab to request screen sharing.`
      : 'Your TV is ready. Get your confirmation code, then type it on your ticket or order\'s Remote setup tab.';
    action.firstChild.textContent = confirmCode ? (expired || confirmationUsed ? 'New code ' : 'New code — available after use or expiry ') : 'Get my confirmation code ';
    if (!expired && confirmationUsed) description.textContent += '\n\nThis reference has been used on a ticket or order. New code is now available for another ticket or order; the existing reference stays valid on its original page until expiry.';
    if (!expired && confirmCode) description.textContent += '\n\nNeed apps installed too? Press Return to home — this code is kept until it expires.';
  } else if (askApps) {
    heading.textContent = 'What do you need?';
    description.textContent = 'Install our apps: puts all our apps on your TV for you.\n\nScreen-share support: lets our staff see your TV and help you through your ticket or order.';
  } else if (s === Step.DEBUGGING) {
    heading.textContent = device ? '1. Enable TV debugging' : 'Which TV are you setting up?';
    deviceHelp.textContent = device ? 'Wrong TV? Choose the other one.' : 'Choose your TV to see the right steps.';
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
        confirmationUsed = false;
        refreshToken = issued.refreshToken || ''; refreshHost = host;
        localStorage.setItem('bm-tv-confirmation', JSON.stringify({ code: confirmCode, expiresAtMs: confirmExpiresAt, refreshToken, host, device, referenceUsed: false }));
        say('✓ Code ready. Type it on your ticket or order\'s Remote setup tab.');
      }
    } else {
      if (apps === 'new') {
        const result = await window.bmTv.installApps(host);
        appsResults = result.results || [];
        wizard.setupFinished(true);
        if (!result.failed.length) {
          say('Confirming the installation…');
          try {
            const verify = await window.bmTv.check(host);
            const dev = verify.type === 'amazon' || verify.type === 'android' ? verify.type : device;
            const issued = await window.bmTv.confirmCode({ adb: true, helper: verify.helper, control: verify.control, accessibility: false }, dev, host, 'install');
            installCode = issued.code; installExpiresAt = issued.expiresAtMs; installUsed = false;
            installRefreshToken = issued.refreshToken || '';
            localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ code: installCode, expiresAtMs: installExpiresAt, refreshToken: installRefreshToken, host, device: dev, referenceUsed: false }));
          } catch { /* The apps are on the TV either way; the code is extra proof for the ticket or order. */ }
        }
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
    localStorage.setItem('bm-tv-confirmation-install', JSON.stringify({ code: installCode, expiresAtMs: installExpiresAt, refreshToken: installRefreshToken, host, device: dev, referenceUsed: false }));
    say('✓ New install code ready. Type it on your ticket or order\'s Remote setup tab.');
  } catch (error) { say(cleanError(error), true); }
  setBusy(false); render();
});
/** A finished app-install run goes back to "What do you need?" — the saved TV address,
 *  device choice and TV authorization are kept, so nothing restarts from scratch. */
function backToStart() {
  if (busy) return;
  // The saved screen-share reference (code, expiry, refresh token, TV) is kept until it expires.
  wizard.reset(); apps = null; appsResults = [];
  if (!confirmationValid()) checks = null;
  localStorage.removeItem('bm-tv-apps');
  say(''); render();
}
startAgain.addEventListener('click', backToStart);

reset.addEventListener('click', () => {
  if (busy) return;
  if (!window.confirm('Reset setup?\n\nThis can\'t be undone. Your saved TV address, device choice and BM TV Enabler reference codes will be cleared, and the new code you create next takes over from the old one. Installed TV apps and this computer\'s TV authorization are kept.\n\nPress OK to confirm the reset.')) return;
  wizard.reset(); checks = null; device = null; apps = null; confirmCode = ''; appsResults = [];
  confirmExpiresAt = 0; refreshToken = ''; refreshHost = '';
  installCode = ''; installExpiresAt = 0; installUsed = false; installRefreshToken = '';
  localStorage.removeItem('bm-tv-confirmation');
  localStorage.removeItem('bm-tv-confirmation-install');
  localStorage.removeItem('bm-tv-address'); localStorage.removeItem('bm-tv-device'); localStorage.removeItem('bm-tv-apps');
  address.value = ''; say(''); render();
});
function pickApps(value) {
  if (busy) return;
  if (value === 'have' && restoreConfirmation()) { localStorage.setItem('bm-tv-apps', value); say(''); render(); return; }
  // A remembered install reference skips re-installing: the apps are already on the TV.
  if (value === 'new' && restoreInstallConfirmation() && device && validHost(address.value.trim()) && wizard.resumeConfirmation(installCode, installExpiresAt)) {
    localStorage.setItem('bm-tv-apps', value); apps = value; say(''); render(); return;
  }
  apps = value; if (value) localStorage.setItem('bm-tv-apps', value); else localStorage.removeItem('bm-tv-apps');
  // Debugging was already confirmed on this TV: go straight to Connect with the saved address.
  if (value && device && validHost(address.value.trim())) wizard.confirmDebugging();
  render();
}
appsNew.addEventListener('click', () => pickApps('new'));
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
setInterval(async () => {
  if (busy || refreshBusy || document.hidden) return;
  refreshBusy = true;
  const token = refreshToken;
  try {
    if (token && Date.now() < confirmExpiresAt) {
      const result = await window.bmTv.refresh(refreshHost, token);
      if (token === refreshToken) {
        if (result.referenceUsed === true) {
          confirmationUsed = true;
          const saved = JSON.parse(localStorage.getItem('bm-tv-confirmation') || 'null');
          if (saved && saved.refreshToken === token) localStorage.setItem('bm-tv-confirmation', JSON.stringify({ ...saved, referenceUsed: true }));
        }
        if (result.done) say('✓ New TV connection sent. Press Connect on your ticket or order.');
      }
    }
  } catch (error) { say(cleanError(error), true); }
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
}, 4000);
