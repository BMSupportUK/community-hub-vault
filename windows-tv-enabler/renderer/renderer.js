const address = document.getElementById('address');
const setupCode = document.getElementById('setup-code');
const scan = document.getElementById('scan');
const enable = document.getElementById('enable');
const devices = document.getElementById('devices');
const status = document.getElementById('scan-status');
const progress = document.getElementById('progress');
const saved = localStorage.getItem('bm-tv-address');
if (saved) address.value = saved;
function busy(value) { scan.disabled = value; enable.disabled = value; address.disabled = value; devices.querySelectorAll('button').forEach(b => b.disabled = value); }
window.bmTv.progress(text => { progress.textContent = text; progress.classList.remove('error'); });
scan.addEventListener('click', async () => {
  busy(true); devices.replaceChildren(); status.textContent = 'Looking for Amazon Fire TVs on your home network…';
  try {
    const found = await window.bmTv.scan();
    status.textContent = found.length ? `${found.length} Fire TV${found.length === 1 ? '' : 's'} found. Select the one you want.` : 'No Fire TVs found. Check both devices are on the same home network, then enter the address shown in BM Remote Helper.';
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
  busy(true); progress.classList.remove('error'); progress.textContent = 'Starting…';
  try { await window.bmTv.enable(address.value.trim(), setupCode.value.replace(/\D/g, '')); localStorage.setItem('bm-tv-address', address.value.trim()); }
  catch (error) { progress.classList.add('error'); progress.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  finally { busy(false); }
});