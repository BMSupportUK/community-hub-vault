import { expect, test } from "bun:test";
import { zipSync } from "fflate";
import { apkPackage, manifestPackage, validAndroidPackage } from "../src/lib/apk-package";

function manifest(utf8: boolean, packageName: string): Uint8Array {
  const strings = ["manifest", "package", packageName];
  const encoded = strings.map(text => utf8
    ? Uint8Array.from([text.length, text.length, ...new TextEncoder().encode(text), 0])
    : Uint8Array.from([text.length, 0, ...Array.from(text).flatMap(c => [c.charCodeAt(0), 0]), 0, 0]));
  const poolSize = 28 + strings.length * 4 + encoded.reduce((n, bytes) => n + bytes.length, 0);
  const bytes = new Uint8Array(8 + poolSize + 56);
  const view = new DataView(bytes.buffer);
  const u16 = (at: number, n: number) => view.setUint16(at, n, true);
  const u32 = (at: number, n: number) => view.setUint32(at, n, true);
  u16(0, 3); u16(2, 8); u32(4, bytes.length);
  u16(8, 1); u16(10, 28); u32(12, poolSize); u32(16, 3); u32(24, utf8 ? 0x100 : 0); u32(28, 40);
  let offset = 0;
  encoded.forEach((text, i) => { u32(36 + i * 4, offset); bytes.set(text, 48 + offset); offset += text.length; });
  const node = 8 + poolSize;
  u16(node, 0x102); u16(node + 2, 16); u32(node + 4, 56);
  u32(node + 16, 0xffffffff); u32(node + 20, 0); u16(node + 24, 20); u16(node + 26, 20); u16(node + 28, 1);
  u32(node + 36, 0xffffffff); u32(node + 40, 1); u32(node + 44, 2); u16(node + 48, 8); bytes[node + 51] = 3; u32(node + 52, 2);
  return bytes;
}

test('APK identity uses the manifest package for both Android string encodings', () => {
  for (const utf8 of [true, false]) {
    const bytes = manifest(utf8, "uk.bmsupport.player");
    expect(manifestPackage(bytes)).toBe("uk.bmsupport.player");
    expect(apkPackage(zipSync({ "AndroidManifest.xml": bytes, "other.txt": new Uint8Array(20) }))).toBe("uk.bmsupport.player");
  }
});
test('missing, malformed or unsafe identities cannot mark an app as already installed', () => {
  expect(apkPackage(new Uint8Array([1, 2, 3]))).toBeNull();
  expect(apkPackage(zipSync({ "other.txt": new Uint8Array(1) }))).toBeNull();
  expect(manifestPackage(manifest(true, "uk.app;reboot"))).toBeNull();
  expect(validAndroidPackage("Player" )).toBe(false);
});