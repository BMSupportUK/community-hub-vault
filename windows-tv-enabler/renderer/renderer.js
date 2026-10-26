/* Wizard UI mirroring the phone BM TV Enabler: one step at a time, real TV checks
   before every advance, optional website linking, safe reset. */
const { Step, CodeResult, Wizard, newCode, ready: allReady, validHost } = SetupWizard;
const wizard = new Wizard();

const el = id => document.getElementById(id);
const heading = el('heading'), description = el('description'), devicePick = el('device-pick'),
  deviceHelp = el('device-help'), addressBlock = el('address-block'), address = el('address'),
  scan = el('scan'), devices = el('devices'), scanStatus = el('scan-status'),
  codeBlock = el('code-block'),
  progress = el('progress'), action = el('action'), next = el('next'), reset = el('reset'), appsResult = el('apps-result'),
  pickAmazon = el('pick-amazon'), pairBlock = el('pair-block'), scanHint = el('scan-hint'), pickAndroid = el('pick-android'),
  tvCodeBlock = el('tv-code-block'), linkBlock = el('link-block'), linkCode = el('link-code'), tvCodeInput = el('tv-code'), showAgain = el('show-again'),
  appsPick = el('apps-pick'), appsNew = el('apps-new'), appsHave = el('apps-have'), appsBack = el('apps-back'),
  pairButton = el('pair'), pairCode = el('pair-code'), pairPort = el('pair-port');

let device = null, checks = null, busy = false, confirmCode = '', appsResults = [];
const welcomeSection = el('welcome'), wizardSection = el('wizard');
const startButton = document.getElementById('welcome-start'), pinInput = el('pin-input'), pinMsg = el('pin-msg');
const loggedIn = () => Number(localStorage.getItem('bm-pin-expires') || 0) > Date.now();
if (loggedIn()) { el('pin-box').hidden = true; startButton.textContent = 'Get started'; }
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
  window.scrollTo(0, 0);
});
const savedAddress = localStorage.getItem('bm-tv-address');
if (savedAddress) address.value = savedAddress;
const savedDevice = localStorage.getItem('bm-tv-device');
if (savedDevice === 'amazon' || savedDevice === 'android') device = savedDevice;
let apps = localStorage.getItem('bm-tv-apps');
if (apps !== 'new' && apps !== 'have') apps = null;

function say(text, isError) {
  progress.textContent = text;
  progress.classList.toggle('error', Boolean(isError));
}

function setBusy(value) {
  busy = value;
  for (const b of [action, next, reset, scan, pickAmazon, pickAndroid, showAgain, pairButton, appsNew, appsHave, appsBack]) b.disabled = value;
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
  const pick = (s === Step.DEBUGGING && !askApps) || (s === Step.DONE && !install && device == null && !confirmCode);
  appsPick.hidden = !askApps; appsBack.hidden = !(s === Step.DEBUGGING && apps != null);
  devicePick.hidden = !pick;
  deviceHelp.hidden = !pick;
  addressBlock.hidden = s !== Step.CHECK;
  tvCodeBlock.hidden = s !== Step.TV_CODE;
  codeBlock.hidden = !(s === Step.DONE && confirmCode) || install;
  linkBlock.hidden = !(s === Step.DONE && wizard.ready) || install;
  codeBlock.textContent = confirmCode ? `${confirmCode.slice(0, 3)}-${confirmCode.slice(3)}` : '';
  next.hidden = true;
  action.hidden = (s === Step.DEBUGGING && (device == null || apps == null)) || (s === Step.DONE && install);
  pairBlock.hidden = device !== 'android';
  scan.textContent = device === 'android' ? 'Find my Android TV' : 'Find my Fire TV';
  scanHint.textContent = device === 'android' ? 'Find my Android TV lists Android / Google TVs on your network (Amazon devices are left out). If yours isn\'t listed, type the address from the TV\'s network settings.' : 'Find my Fire TV lists only Amazon Fire TVs on your network, so you can pick the right one if you have more than one.';
  appsResult.hidden = !(s === Step.DONE && install && appsResults.length);
  if (!appsResult.hidden) {
    appsResult.replaceChildren();
    for (const r of appsResults) {
      const row = document.createElement('p'); row.className = 'app-row';
      const name = document.createElement('strong'); name.textContent = r.name;
      const state = document.createElement('span');
      state.className = r.status === 'failed' ? 'app-state failed' : 'app-state';
      state.textContent = r.status === 'installed' ? 'Installed' : r.status === 'already' ? 'Already on your TV' : "Didn't install — press Reset setup to try again";
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
    description.textContent = 'Each app is listed below with what happened. You can close this app. To install again, press Reset setup.';
  } else if (s === Step.DONE) {
    deviceHelp.textContent = 'Which TV is this? Choose the same type as your ticket or order.';
    description.textContent = confirmCode
      ? 'Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. It works once and lasts 2 hours.\n\nThen press Connect on that tab to request screen sharing (if it asks, type the six-digit code shown on the TV instead).'
      : 'Your TV is ready. Get your confirmation code, then type it on your ticket or order\'s Remote setup tab.';
    action.firstChild.textContent = confirmCode ? 'New code ' : 'Get my confirmation code ';
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
        confirmCode = await window.bmTv.confirmCode(checks, device, host);
        say('✓ Code ready. Type it on your ticket or order\'s Remote setup tab.');
      }
    } else {
      if (apps === 'new') {
        const result = await window.bmTv.installApps(host);
        appsResults = result.results || [];
        wizard.setupFinished(true);
        say(result.failed.length ? `Done, but ${result.failed.length} app${result.failed.length === 1 ? '' : 's'} didn't install — see the list below. Press Reset setup to try again.` : `✓ All done — ${result.installed.length} app${result.installed.length === 1 ? '' : 's'} on your TV. See the list below.`, result.failed.length > 0);
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
  if (busy) return;
  const s = wizard.step;
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

next.addEventListener('click', () => render());
reset.addEventListener('click', () => {
  if (busy) return;
  if (!window.confirm('Start again from debugging instructions and clear the saved TV address, device choice and confirmation code? Installed TV apps and this computer\'s TV authorization are kept.')) return;
  wizard.reset(); checks = null; device = null; apps = null; confirmCode = ''; appsResults = [];
  localStorage.removeItem('bm-tv-address'); localStorage.removeItem('bm-tv-device'); localStorage.removeItem('bm-tv-apps');
  address.value = ''; say(''); render();
});
function pickApps(value) { if (busy) return; apps = value; if (value) localStorage.setItem('bm-tv-apps', value); else localStorage.removeItem('bm-tv-apps'); render(); }
appsNew.addEventListener('click', () => pickApps('new'));
appsHave.addEventListener('click', () => pickApps('have'));
appsBack.addEventListener('click', () => pickApps(null));
pickAmazon.addEventListener('click', () => pickDevice('amazon'));
pickAndroid.addEventListener('click', () => pickDevice('android'));
scan.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); devices.replaceChildren(); scanStatus.textContent = 'Looking for TVs on your home network…';
  try {
    const found = await window.bmTv.scan(device);
    scanStatus.textContent = found.length ? `${found.length} TV${found.length === 1 ? '' : 's'} found. Select the one you want.` : 'No TVs found. Check both devices are on the same home network, then type the TV address.';
    for (const tv of found) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'device';
      const label = document.createElement('span'); label.textContent = tv.name;
      const ip = document.createElement('small'); ip.textContent = tv.address; label.append(ip);
      const state = document.createElement('span'); state.className = tv.debugging ? 'state' : 'state unreachable';
      state.textContent = tv.debugging ? 'Debugging reachable' : 'Debugging not reachable — check switch';
      button.append(label, state);
      button.addEventListener('click', () => { devices.querySelectorAll('button').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); }); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); address.value = tv.address; });
      button.setAttribute('aria-pressed', 'false'); devices.append(button);
    }
  } catch (error) { scanStatus.textContent = cleanError(error); }
  finally { setBusy(false); }
});
window.bmTv.progress(text => say(text));
render();
