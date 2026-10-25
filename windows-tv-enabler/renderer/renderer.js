const address = document.getElementById('address');
const setupCode = document.getElementById('setup-code');
const scan = document.getElementById('scan');
const enable = document.getElementById('enable');
const devices = document.getElementById('devices');
const status = document.getElementById('scan-status');
const progress = document.getElementById('progress');
const pickAmazon = document.getElementById('pick-amazon');
const pickAndroid = document.getElementById('pick-android');
const deviceHelp = document.getElementById('device-help');
const saved = localStorage.getItem('bm-tv-address');
if (saved) address.value = saved;
let device = null;
const DEVICE_HELP = {
  amazon: 'On the TV: Settings → My Fire TV → About — press the device name 7 times, then Settings → My Fire TV → Developer options → ADB debugging → ON.',
  android: 'On the TV: Settings → System → About — press Android TV OS build 7 times, then Settings → System → Developer options → Network debugging → ON.',
};
function pickDevice(value) {
  device = value;
  localStorage.setItem('bm-tv-device', value);
  pickAmazon.classList.toggle('selected', value === 'amazon');
  pickAndroid.classList.toggle('selected', value === 'android');
  pickAmazon.setAttribute('aria-pressed', String(value === 'amazon'));
  pickAndroid.setAttribute('aria-pressed', String(value === 'android'));
  deviceHelp.textContent = DEVICE_HELP[value];
}
pickAmazon.addEventListener('click', () => pickDevice('amazon'));
pickAndroid.addEventListener('click', () => pickDevice('android'));
const savedDevice = localStorage.getItem('bm-tv-device');
if (savedDevice === 'amazon' || savedDevice === 'android') pickDevice(savedDevice);
function busy(value) { scan.disabled = value; enable.disabled = value; address.disabled = value; pickAmazon.disabled = value; pickAndroid.disabled = value; devices.querySelectorAll('button').forEach(b => b.disabled = value); }
window.bmTv.progress(text => { progress.textContent = text; progress.classList.remove('error'); });
scan.addEventListener('click', async () => {
  busy(true); devices.replaceChildren(); status.textContent = 'Looking for TVs on your home network…';
  try {
    const found = await window.bmTv.scan();
    status.textContent = found.length ? `${found.length} TV${found.length === 1 ? '' : 's'} found. Select the one you want.` : 'No TVs found. Check both devices are on the same home network, then type the TV address.';
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
  } catch (error) { status.textContent = error.message; }
  finally { busy(false); }
});
enable.addEventListener('click', async () => {
  if (!device) { progress.classList.add('error'); progress.textContent = 'First choose which TV you are setting up: Amazon Fire TV or Android / Google TV.'; return; }
  busy(true); progress.classList.remove('error'); progress.textContent = 'Starting…';
  try { await window.bmTv.enable(address.value.trim(), setupCode.value.replace(/\D/g, ''), device); localStorage.setItem('bm-tv-address', address.value.trim()); }
  catch (error) { progress.classList.add('error'); progress.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  finally { busy(false); }
});
