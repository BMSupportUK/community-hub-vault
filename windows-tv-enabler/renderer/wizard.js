/* UI-independent progression, mirroring the phone app's SetupWizard:
   confirmations never substitute for real TV checks. */
const SetupWizard = (() => {
  const Step = {
    DEBUGGING: 'DEBUGGING', CHECK: 'CHECK', DEVICE: 'DEVICE', HELPER: 'HELPER',
    CONTROL: 'CONTROL', ACTIVATE: 'ACTIVATE', REPORT: 'REPORT', DONE: 'DONE',
  };
  class Wizard {
    constructor() { this.step = Step.DEBUGGING; this.ready = false; this.completed = false; }
    confirmDebugging() { if (this.step === Step.DEBUGGING) this.step = Step.CHECK; }
    checked(isReady) { if (this.step !== Step.CHECK) return; this.ready = isReady; this.completed = true; }
    chooseDevice() { if (this.step === Step.DEVICE) { this.step = this.ready ? Step.REPORT : Step.HELPER; this.completed = false; } }
    operationCompleted() { this.completed = true; }
    confirmTv(isReady) {
      if (this.step !== Step.REPORT) return;
      this.ready = isReady;
      this.completed = isReady;
    }
    next() {
      if (!this.completed) return;
      switch (this.step) {
        case Step.CHECK: this.step = this.ready ? Step.REPORT : Step.DEVICE; break;
        case Step.HELPER: this.step = Step.CONTROL; break;
        case Step.CONTROL: this.step = Step.ACTIVATE; break;
        case Step.ACTIVATE: this.step = Step.REPORT; break;
        case Step.REPORT: this.step = Step.DONE; break;
        default: return;
      }
      this.completed = false;
    }
    reset() { this.step = Step.DEBUGGING; this.ready = false; this.completed = false; }
  }
  function ready(adb, helper, control, accessibility) { return adb && helper && control && accessibility; }
  function validHost(host) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return host.split('.').every(part => Number(part) <= 255);
  }
  return { Step, Wizard, ready, validHost };
})();
if (typeof module !== 'undefined') module.exports = SetupWizard;
