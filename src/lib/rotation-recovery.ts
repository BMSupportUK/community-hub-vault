/**
 * Staff "customer turned their phone" notice. It clears only on freshly
 * presented, non-black frames that arrive after the turn. The customer's
 * "camera-ready" signal lets it clear sooner, but it is never required —
 * after a connection rebuild that signal may never come, and the notice must
 * not stay stuck over a working picture.
 */
export const CAMERA_READY_WAIT_MS = 2500;
export const GOOD_FRAMES_NEEDED = 5;
export const GOOD_PICTURE_MS = 700;

export class RotationRecovery {
  active = false;
  private waitUntil = 0;
  private goodSince: number | null = null;
  private goodFrames = 0;

  begin(awaitingCamera: boolean, now: number) {
    this.active = true;
    this.waitUntil = awaitingCamera ? now + CAMERA_READY_WAIT_MS : now;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  cameraReady() {
    this.waitUntil = 0;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  cameraOff() {
    this.active = false;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  presented(now: number, black: boolean) {
    if (!this.active || now < this.waitUntil) return false;
    if (black) {
      this.goodSince = null;
      this.goodFrames = 0;
      return false;
    }
    this.goodSince ??= now;
    this.goodFrames++;
    if (this.goodFrames < GOOD_FRAMES_NEEDED || now - this.goodSince < GOOD_PICTURE_MS) return false;
    this.active = false;
    return true;
  }
}
