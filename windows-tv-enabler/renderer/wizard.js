/* UI-independent progression, mirroring the phone app's SetupWizard: the code shown on
   the TV proves the customer picked their own TV; after that, setup runs automatically
   and only a real TV check can finish it. */
const SetupWizard = (() => {
  const Step = { DEBUGGING: 'DEBUGGING', CHECK: 'CHECK', TV_CODE: 'TV_CODE', SETUP: 'SETUP', DONE: 'DONE' };
  const CodeResult = { OK: 'OK', WRONG: 'WRONG', RESET: 'RESET', IGNORED: 'IGNORED' };
  const MAX_TRIES = 3;
  class Wizard {
    constructor() { this.step = Step.DEBUGGING; this.ready = false; this.tvCode = null; this.tries = 0; }
    confirmDebugging() { if (this.step === Step.DEBUGGING) this.step = Step.CHECK; }
    connected(code) { if (this.step !== Step.CHECK) return; this.tvCode = code; this.tries = 0; this.step = Step.TV_CODE; }
    enterCode(typed) {
      if (this.step !== Step.TV_CODE || this.tvCode == null) return CodeResult.IGNORED;
      if (this.tvCode === String(typed ?? '').trim()) { this.step = Step.SETUP; this.tvCode = null; return CodeResult.OK; }
      if (++this.tries >= MAX_TRIES) { this.step = Step.CHECK; this.tvCode = null; this.tries = 0; return CodeResult.RESET; }
      return CodeResult.WRONG;
    }
    setupFinished(isReady) { if (this.step !== Step.SETUP) return; this.ready = isReady; if (isReady) this.step = Step.DONE; }
    reset() { this.step = Step.DEBUGGING; this.ready = false; this.tvCode = null; this.tries = 0; }
  }
  function newCode() {
    const n = new Uint32Array(1); globalThis.crypto.getRandomValues(n);
    return String(n[0] % 10000).padStart(4, '0');
  }
  function ready(adb, helper, control, accessibility) { return adb && helper && control && accessibility; }
  function validHost(host) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return host.split('.').every(part => Number(part) <= 255);
  }
  return { Step, CodeResult, MAX_TRIES, Wizard, newCode, ready, validHost };
})();
if (typeof module !== 'undefined') module.exports = SetupWizard;
