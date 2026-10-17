/** Require fresh, non-black presented frames after camera replacement, not an old decoded frame. */
export class RotationRecovery {
  active = false;
  private awaitingCamera = false;
  private goodSince: number | null = null;
  private goodFrames = 0;

  begin(awaitingCamera: boolean) {
    this.active = true;
    this.awaitingCamera = awaitingCamera;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  cameraReady() {
    this.awaitingCamera = false;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  cameraOff() {
    this.active = false;
    this.goodSince = null;
    this.goodFrames = 0;
  }

  presented(now: number, black: boolean) {
    if (!this.active || this.awaitingCamera) return false;
    if (black) {
      this.goodSince = null;
      this.goodFrames = 0;
      return false;
    }
    this.goodSince ??= now;
    this.goodFrames++;
    if (this.goodFrames < 3 || now - this.goodSince < 500) return false;
    this.active = false;
    return true;
  }
}