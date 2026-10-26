/* Wizard UI mirroring the phone BM TV Enabler: one step at a time, real TV checks
   before every advance, optional website linking, safe reset. */
const { Step, CodeResult, Wizard, newCode, ready: allReady, validHost } = SetupWizard;
const wizard = new Wizard();

const el = id => document.getElementById(id);
const heading = el('heading'), description = el('description'), devicePick = el('device-pick'),
  deviceHelp = el('device-help'), addressBlock = el('address-block'), address = el('address'),
  scan = el('scan'), devices = el('devices'), scanStatus = el('scan-status'),
  codeBlock = el('code-block'), openHelper = el('open-helper'),
  progress = el('progress'), action = el('action'), next = el('next'), back = el('back'), reset = el('reset'),
  pickAmazon = el('pick-amazon'), pickAndroid = el('pick-android'),
  tvCodeBlock = el('tv-code-block'), tvCodeInput = el('tv-code'), showAgain = el('show-again');

let device = null, checks = null, busy = false, confirmCode = '';
const savedAddress = localStorage.getItem('bm-tv-address');
if (savedAddress) address.value = savedAddress;
const savedDevice = localStorage.getItem('bm-tv-device');
if (savedDevice === 'amazon' || savedDevice === 'android') device = savedDevice;

function say(text, isError) {
  progress.textContent = text;
  progress.classList.toggle('error', Boolean(isError));
}

function setBusy(value) {
  busy = value;
  for (const b of [action, next, back, reset, scan, openHelper, pickAmazon, pickAndroid, showAgain]) b.disabled = value;
  address.disabled = value; tvCodeInput.disabled = value;
  devices.querySelectorAll('button').forEach(b => { b.disabled = value; });
}

function pickDevice(value) {
  if (busy) return;
  device = value;
  localStorage.setItem('bm-tv-device', value);
  render();
}

const DESCRIPTIONS = {
  [Step.DEBUGGING]: 'Put this computer and your TV on the same home network (avoid guest Wi-Fi and disconnect any VPN). Switch on the setting for your TV:\n\nAmazon Fire TV\nSettings › My Fire TV › About — press the device name 7 times. Go back to Developer options and switch ADB debugging ON.\n\nAndroid / Google TV\nSettings › System › About — press Android TV OS build 7 times. Go back to Developer options and switch Network debugging ON, or Wireless debugging ON if your TV has that instead.',
  [Step.CHECK]: 'Type the TV\'s address from its network settings, or use Find my TV (Amazon devices only).\n\nWhen the TV asks, tick Always allow and press Allow. A 4-digit code will then appear on the TV screen.',
  [Step.TV_CODE]: 'Look at your TV — a message with a 4-digit code has appeared (on some TVs it\'s in the notifications). Type it below so we know this is your TV. After that, setup runs by itself.',
  [Step.SETUP]: 'We check what\'s already on the TV, install BM Remote Helper and remote control if needed, switch remote control on, then check everything again. Keep both devices awake.',
};

function render() {
  const s = wizard.step;
  const pick = s === Step.DONE && device == null && !confirmCode;
  devicePick.hidden = !pick;
  deviceHelp.hidden = !pick;
  addressBlock.hidden = s !== Step.CHECK;
  tvCodeBlock.hidden = s !== Step.TV_CODE;
  codeBlock.hidden = !(s === Step.DONE && confirmCode);
  codeBlock.textContent = confirmCode ? `${confirmCode.slice(0, 3)}-${confirmCode.slice(3)}` : '';
  openHelper.hidden = !(s === Step.DONE && wizard.ready);
  next.hidden = true;
  action.hidden = false;
  back.hidden = !(s === Step.CHECK || s === Step.TV_CODE);
  pickAmazon.classList.toggle('selected', device === 'amazon');
  pickAndroid.classList.toggle('selected', device === 'android');
  pickAmazon.setAttribute('aria-pressed', String(device === 'amazon'));
  pickAndroid.setAttribute('aria-pressed', String(device === 'android'));
  const titles = { [Step.DEBUGGING]: '1. Enable TV debugging', [Step.CHECK]: '2. Connect to your TV', [Step.TV_CODE]: '3. Type the code on your TV', [Step.SETUP]: '4. Setting up your TV', [Step.DONE]: 'TV setup confirmed' };
  const labels = { [Step.DEBUGGING]: 'I\'ve switched debugging on — next ', [Step.CHECK]: 'Connect to this TV ', [Step.TV_CODE]: 'Confirm code and set up my TV ', [Step.SETUP]: 'Try again ' };
  heading.textContent = titles[s];
  if (s === Step.DONE) {
    deviceHelp.textContent = 'Which TV is this? Choose the same type as your ticket or order.';
    description.textContent = confirmCode
      ? 'Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. It works once and lasts 2 hours.\n\nThen press Connect on that tab to request screen sharing (if it asks, type the six-digit code shown on the TV instead). Use the button above to reopen BM Remote Helper for a new TV code.'
      : 'Your TV is ready. Get your confirmation code, then type it on your ticket or order\'s Remote setup tab.';
    action.firstChild.textContent = confirmCode ? 'New code ' : 'Get my confirmation code ';
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
    if (!existing) wizard.connected(code);
    say('✓ Connected. Look for the 4-digit code on your TV.');
  } catch (error) { say(cleanError(error), true); }
  finally { setBusy(false); render(); }
}

async function run(stage, host) {
  setBusy(true);
  say(stage === Step.DONE ? 'Getting your confirmation code…' : 'Checking your TV…');
  try {
    if (stage === Step.DONE) {
      if (!checks || !wizard.ready) { say('Check the TV again first.', true); return; }
      if (device == null) { say('Choose which TV this is first.', true); return; }
      confirmCode = await window.bmTv.confirmCode(checks, device, host);
      say('✓ Code ready. Type it on your ticket or order\'s Remote setup tab.');
    } else {
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
      if (ok) { say('Opening BM Remote Helper on your TV…'); await window.bmTv.openCodeApp(host); }
      wizard.setupFinished(ok);
      say(ok ? '✓ TV setup confirmed: both apps installed and remote control switched on. BM Remote Helper is open on your TV.' : 'The TV is not fully ready yet. Press Try again.', !ok);
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

showAgain.addEventListener('click', () => { if (!busy && wizard.tvCode) showCode(address.value.trim(), wizard.tvCode); });

next.addEventListener('click', () => render());
back.addEventListener('click', () => { if (!busy) { wizard.reset(); checks = null; confirmCode = ''; say(''); render(); } });
reset.addEventListener('click', () => {
  if (busy) return;
  if (!window.confirm('Start again from debugging instructions and clear the saved TV address, device choice and confirmation code? Installed TV apps and this computer\'s TV authorization are kept.')) return;
  wizard.reset(); checks = null; device = null; confirmCode = '';
  localStorage.removeItem('bm-tv-address'); localStorage.removeItem('bm-tv-device');
  address.value = ''; say(''); render();
});
openHelper.addEventListener('click', async () => {
  if (busy) return;
  const host = address.value.trim();
  if (!validHost(host)) { say('Type the TV\'s address first.', true); return; }
  setBusy(true); say('Opening BM Remote Helper on your TV…');
  try {
    await window.bmTv.openCodeApp(host);
    say('✓ BM Remote Helper is open on your TV. Enter its six-digit code in your ticket or order\'s Remote setup tab on bmsupport.uk.');
  } catch (error) { say(cleanError(error), true); }
  finally { setBusy(false); render(); }
});
pickAmazon.addEventListener('click', () => pickDevice('amazon'));
pickAndroid.addEventListener('click', () => pickDevice('android'));
scan.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); devices.replaceChildren(); scanStatus.textContent = 'Looking for TVs on your home network…';
  try {
    const found = await window.bmTv.scan();
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
