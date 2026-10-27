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
    /** Wireless debugging pairing code from the TV already proves it's the right TV. */
    paired() { if (this.step === Step.CHECK) { this.tvCode = null; this.tries = 0; this.step = Step.SETUP; } }
    setupFinished(isReady) { if (this.step !== Step.SETUP) return; this.ready = isReady; if (isReady) this.step = Step.DONE; }
    reset() { this.step = Step.DEBUGGING; this.ready = false; this.tvCode = null; this.tries = 0; }
    resumeConfirmation(code, expiresAt, now = Date.now()) {
      if (!/^[A-Z0-9]{6}$/.test(code || '') || !Number.isFinite(expiresAt) || expiresAt <= now) return false;
      this.step = Step.DONE; this.ready = true; this.tvCode = null; this.tries = 0;
      return true;
    }
    /** A used reference resumes without its code: the TV stays confirmed and a new code can be issued. */
    resumeUsed(expiresAt, now = Date.now()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
      this.step = Step.DONE; this.ready = true; this.tvCode = null; this.tries = 0;
      return true;
    }
  }
  function newCode() {
    const n = new Uint32Array(1); globalThis.crypto.getRandomValues(n);
    return String(n[0] % 10000).padStart(4, '0');
  }
  function ready(adb, helper, control, accessibility) { return adb && helper && control && accessibility; }
  function validHost(host) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(host);
    if (!m) return false;
    if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535)) return false;
    return m[1].split('.').every(part => Number(part) <= 255);
  }
  /** A finished app-install run offers "Return to the start", never "Reset setup". */
  function installFinished(step, apps) { return step === Step.DONE && apps === 'new'; }
  function canIssueConfirmation(hasCode, expiresAt, used, now = Date.now()) {
    return !hasCode || used || expiresAt <= now;
  }
  return { Step, CodeResult, MAX_TRIES, Wizard, newCode, ready, validHost, installFinished, canIssueConfirmation };
})();
if (typeof module !== 'undefined') module.exports = SetupWizard;
