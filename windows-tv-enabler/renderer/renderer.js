/* Wizard UI mirroring the phone BM TV Enabler: one step at a time, real TV checks
   before every advance, optional website linking, safe reset. */
const { Step, Wizard, ready: allReady, validHost } = SetupWizard;
const wizard = new Wizard();

const el = id => document.getElementById(id);
const heading = el('heading'), description = el('description'), devicePick = el('device-pick'),
  deviceHelp = el('device-help'), addressBlock = el('address-block'), address = el('address'),
  scan = el('scan'), devices = el('devices'), scanStatus = el('scan-status'),
  codeBlock = el('code-block'), openHelper = el('open-helper'),
  progress = el('progress'), action = el('action'), next = el('next'), back = el('back'), reset = el('reset'),
  pickAmazon = el('pick-amazon'), pickAndroid = el('pick-android');

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
  for (const b of [action, next, back, reset, scan, openHelper, pickAmazon, pickAndroid]) b.disabled = value;
  address.disabled = value;
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
  [Step.CHECK]: 'Type the TV\'s address from its network settings, or use Find my TV (Amazon devices only).\n\nWe\'ll check whether the apps and permissions are already set up. If they are, BM Remote Helper opens straight away — nothing is reinstalled.',
  [Step.HELPER]: 'This app downloads BM Remote Helper and sends it to the TV over your home network, then opens it on the TV. Keep both devices awake; press Allow on the TV if asked.',
  [Step.CONTROL]: 'This app extracts the remote-control app bundled with BM Remote Helper, sends it to the TV and installs it. Existing installed apps are kept.',
  [Step.ACTIVATE]: 'We\'ll enable BM Remote Control\'s accessibility permission and check it on the TV, then open BM Remote Helper so your code is visible.',
};

function render() {
  const s = wizard.step;
  const pick = s === Step.DEVICE || (s === Step.DONE && device == null && !confirmCode);
  devicePick.hidden = !pick;
  deviceHelp.hidden = !pick;
  addressBlock.hidden = s !== Step.CHECK;
  codeBlock.hidden = !(s === Step.DONE && confirmCode);
  codeBlock.textContent = confirmCode ? `${confirmCode.slice(0, 3)}-${confirmCode.slice(3)}` : '';
  openHelper.hidden = !((s === Step.REPORT || s === Step.DONE) && wizard.ready);
  next.hidden = !wizard.completed;
  action.hidden = wizard.completed;
  next.firstChild.textContent = s === Step.REPORT ? 'TV confirmed — finish setup ' : 'Done — next step ';
  back.hidden = !(s === Step.CHECK && !wizard.completed);
  pickAmazon.classList.toggle('selected', device === 'amazon');
  pickAndroid.classList.toggle('selected', device === 'android');
  pickAmazon.setAttribute('aria-pressed', String(device === 'amazon'));
  pickAndroid.setAttribute('aria-pressed', String(device === 'android'));
  switch (s) {
    case Step.DEBUGGING:
      heading.textContent = '1. Enable TV debugging';
      description.textContent = DESCRIPTIONS[Step.DEBUGGING];
      action.firstChild.textContent = 'I\'ve switched debugging on — next '; break;
    case Step.CHECK:
      heading.textContent = '2. Check your TV';
      description.textContent = DESCRIPTIONS[Step.CHECK];
      action.firstChild.textContent = 'Check this TV '; break;
    case Step.DEVICE:
      heading.textContent = '3. Confirm your TV type';
      description.textContent = wizard.ready
        ? 'Your TV is ready and its code app is open. Choose the same TV type as your ticket or order to confirm setup with BM Support.'
        : 'Choose the TV you\'re setting up. We\'ll install BM Remote Helper, install remote control, then activate it — one step at a time.';
      deviceHelp.textContent = device == null ? 'Choose Amazon Fire TV or Android / Google TV.'
        : `Selected: ${device === 'amazon' ? 'Amazon Fire TV' : 'Android / Google TV'}. Keep debugging switched on.`;
      action.firstChild.textContent = 'Confirm device — next '; break;
    case Step.HELPER:
      heading.textContent = '4. Install BM Remote Helper';
      description.textContent = DESCRIPTIONS[Step.HELPER];
      action.firstChild.textContent = 'Install and open Helper '; break;
    case Step.CONTROL:
      heading.textContent = '5. Install remote control';
      description.textContent = DESCRIPTIONS[Step.CONTROL];
      action.firstChild.textContent = 'Install remote control '; break;
    case Step.ACTIVATE:
      heading.textContent = '6. Activate remote control';
      description.textContent = DESCRIPTIONS[Step.ACTIVATE];
      action.firstChild.textContent = 'Activate and check permissions '; break;
    case Step.REPORT:
      heading.textContent = wizard.ready ? '3. Confirm TV setup' : '7. Confirm TV setup';
      description.textContent = 'We\'ll check the TV one last time: BM Remote Helper installed, remote control installed, and its permission switched on. If everything checks out, setup is finished and BM Remote Helper stays open on the TV with your six-digit screen-share code.\n\nWhen it\'s confirmed you\'ll get a short code to type on your ticket or order\'s Remote setup tab.';
      action.firstChild.textContent = 'Check and confirm TV setup '; break;
    case Step.DONE:
      heading.textContent = 'TV setup confirmed';
      deviceHelp.textContent = 'Which TV is this? Choose the same type as your ticket or order.';
      description.textContent = confirmCode
        ? 'Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. It works once and lasts 2 hours.\n\nThen enter the six-digit code shown on the TV in the same tab to request screen sharing. Use the button above to reopen BM Remote Helper for a new TV code.'
        : 'Your TV is ready. Get your confirmation code, then type it on your ticket or order\'s Remote setup tab.';
      action.firstChild.textContent = confirmCode ? 'New code ' : 'Get my confirmation code '; break;
  }
  setBusy(busy);
}

function cleanError(error) {
  return String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
}

async function run(stage) {
  const host = address.value.trim();
  if (!validHost(host)) { say('Type the TV\'s address exactly as it shows on the TV, e.g. 192.168.1.25.', true); return; }
  localStorage.setItem('bm-tv-address', host);
  setBusy(true);
  say(stage === Step.DONE ? 'Getting your confirmation code…' : 'Checking your TV… keep this app open and watch your TV for an Allow box.');
  try {
    if (stage === Step.DONE) {
      if (!checks || !wizard.ready) { say('Check the TV again first.', true); return; }
      if (device == null) { say('Choose which TV this is first.', true); return; }
      confirmCode = await window.bmTv.confirmCode(checks, device);
      say('✓ Code ready. Type it on your ticket or order\'s Remote setup tab.');
    } else if (stage === Step.CHECK || stage === Step.REPORT) {
      checks = await window.bmTv.check(host);
      const isReady = allReady(checks.adb, checks.helper, checks.control, checks.accessibility);
      if (stage === Step.CHECK) {
        if (isReady) {
          say('This TV is already set up. Opening BM Remote Helper to show your code…');
          await window.bmTv.openCodeApp(host);
        }
        wizard.checked(isReady);
        say(isReady ? '✓ This TV is already set up. BM Remote Helper is open on your TV with your code.' : '✓ TV checked. Some apps or permissions still need setting up. Confirm to continue.');
      } else {
        wizard.confirmTv(isReady);
        say(isReady ? '✓ TV setup confirmed: both apps installed and remote-control permission enabled. Your TV code app is open. Press finish.' : 'The TV is not fully ready. Go back to debugging instructions and check setup again.', !isReady);
      }
    } else {
      if (stage === Step.HELPER) checks = await window.bmTv.installHelper(host);
      else if (stage === Step.CONTROL) checks = await window.bmTv.installControl(host);
      else checks = await window.bmTv.activate(host);
      wizard.operationCompleted();
      say('✓ This step is complete and checked on the TV. Confirm to continue.');
    }
  } catch (error) {
    say(cleanError(error), true);
    action.firstChild.textContent = 'Try again ';
  } finally {
    setBusy(false);
    render();
  }
}

action.addEventListener('click', () => {
  if (busy) return;
  const s = wizard.step;
  if (s === Step.DEBUGGING) { wizard.confirmDebugging(); say(''); render(); return; }
  if (s === Step.DEVICE) {
    if (device == null) { say('Choose which TV you\'re setting up first.', true); return; }
    wizard.chooseDevice(); say(''); render(); return;
  }
  run(s);
});

next.addEventListener('click', () => { wizard.next(); say(''); render(); });
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
